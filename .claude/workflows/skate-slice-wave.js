export const meta = {
  name: 'skate-slice-wave',
  description: 'Build game feature slices: implement, review+playtest, bounded fix rounds',
  phases: [{ title: 'Implement' }, { title: 'Review' }, { title: 'Fix' }],
}

const IMPL = {
  type: 'object',
  properties: {
    summary: { type: 'string' },
    files: { type: 'array', items: { type: 'string' } },
    tests: { type: 'string', description: 'which tests were added and their result' },
    howToVerify: { type: 'string' },
    openIssues: { type: 'array', items: { type: 'string' } },
  },
  required: ['summary', 'files', 'tests', 'howToVerify', 'openIssues'],
}
const REVIEW = {
  type: 'object',
  properties: {
    summary: { type: 'string' },
    testsPass: { type: 'boolean' },
    buildPass: { type: 'boolean' },
    screenshots: { type: 'array', items: { type: 'string' }, description: 'absolute paths of screenshots you inspected' },
    findings: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          severity: { type: 'string', enum: ['blocker', 'major', 'minor'] },
          title: { type: 'string' },
          detail: { type: 'string', description: 'what is wrong, evidence, and the expected behaviour' },
          file: { type: 'string' },
        },
        required: ['severity', 'title', 'detail'],
      },
    },
  },
  required: ['summary', 'testsPass', 'buildPass', 'screenshots', 'findings'],
}

const ROOT = '/home/marvin/dev/skating-game'
const MAX_FIX_ROUNDS = 2
const common = `Project: ${ROOT} — a pixel-art endless skate runner (Vite + TypeScript + Canvas, no game engine).
Product spec:\n${args.spec}\n
Rules for every agent:
- Never run git commit/add/stash/reset or any history-changing git command; the orchestrator commits.
- Other slices may be worked on in parallel in the same working tree. Only create/modify files inside the paths your slice owns (listed below). If you truly need a change elsewhere, do not make it — report it in openIssues.
- If docs/ARCHITECTURE.md and CLAUDE.md exist, read them first and follow their contracts.
- Write code that a later agent can extend: small modules, clear names, no dead code.`

const sliceInfo = s => `Slice: ${s.name}\nOwned paths: ${s.owns.join(', ')}\n\nBrief:\n${s.brief}\n\nAcceptance criteria:\n${s.acceptance.map((a, i) => `${i + 1}. ${a}`).join('\n')}`

const results = await pipeline(args.slices, async s => {
  let impl = await agent(`${common}\n\n${sliceInfo(s)}\n\nYou are the implementer. Build this slice completely.
Use test-driven development for logic (physics, rules, state, parsing): write the failing Vitest test first, then the implementation (follow the test-driven-development skill). Visual/render code needs no unit tests but must be checked by running the playtest harness (if it exists) and looking at screenshots with the Read tool.
Before finishing: npm test and npm run build must pass for your slice, and you must have looked at at least one screenshot of your result. Return the structured summary.`,
    { label: `impl:${s.name}`, phase: 'Implement', schema: IMPL })

  const reviews = []
  let unresolved = []
  for (let round = 0; round <= MAX_FIX_ROUNDS; round++) {
    const review = await agent(`${common}\n\n${sliceInfo(s)}\n\nYou are the reviewer AND play-tester for this slice (review round ${round + 1}). The implementer reported:\n${JSON.stringify(impl, null, 1)}\n
Do all of:
1. Code review of the slice's owned files: correctness bugs, contract violations against docs/ARCHITECTURE.md, missing tests for logic, maintainability problems that will hurt later slices.
2. Run npm test and npm run build. If a failure clearly comes from another slice's files (parallel work), mention it in summary but do not count it against this slice.
3. Play-test: use the project's playtest harness (npm run playtest / scripts and the window.__game test hook, see docs) to drive the game at desktop 1280x720 and phone landscape 844x390 (touch) and portrait 390x844. Save screenshots under ${ROOT}/playtest-output/review-${s.name}-r${round + 1}/ and LOOK at them with the Read tool. Judge as a player: does it look like good pixel art, readable, crisp (no blur), does it feel right, does it match the spec?
4. Check every acceptance criterion explicitly.
Severity: blocker = acceptance criterion failed or broken/crashing; major = clearly visible quality or feel problem, or bug likely to bite later slices; minor = polish. Be concrete and actionable, cite evidence. Do NOT edit any files except screenshots.`,
      { label: `review:${s.name}#${round + 1}`, phase: 'Review', schema: REVIEW, model: 'sonnet' })
    if (!review) break
    reviews.push(review)
    const blocking = review.findings.filter(f => f.severity !== 'minor')
    unresolved = blocking
    if (!blocking.length || round === MAX_FIX_ROUNDS) break
    log(`${s.name}: round ${round + 1} found ${blocking.length} blocker/major issue(s), fixing`)
    impl = await agent(`${common}\n\n${sliceInfo(s)}\n\nYou are the implementer, fixing review feedback (round ${round + 1}). Previous implementation summary:\n${JSON.stringify(impl, null, 1)}\n\nFix these blocker/major findings:\n${JSON.stringify(blocking, null, 1)}\n\nAlso fix these minor findings if cheap:\n${JSON.stringify(review.findings.filter(f => f.severity === 'minor'), null, 1)}\n\nUse a failing test first for logic bugs. Afterwards npm test and npm run build must pass and you must look at fresh screenshots. Return the structured summary (files = all files of the slice you touched in total).`,
      { label: `fix:${s.name}#${round + 1}`, phase: 'Fix', schema: IMPL })
  }
  const last = reviews[reviews.length - 1]
  return {
    slice: s.name,
    impl,
    rounds: reviews.length,
    lastReview: last ? { summary: last.summary, testsPass: last.testsPass, buildPass: last.buildPass, screenshots: last.screenshots } : null,
    unresolved,
    minors: last ? last.findings.filter(f => f.severity === 'minor') : [],
  }
})
return results
