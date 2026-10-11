/** Word wrapping for the pixel font (measured at scale 1). */
import { measureText } from '../core/font';

/** `s` broken into lines at most `maxW` wide (words longer than a line are cut). */
export function wrapText(s: string, maxW: number): string[] {
  const lines: string[] = [];
  for (const paragraph of s.split('\n')) {
    let line = '';
    for (const word of paragraph.split(' ')) {
      const next = line ? `${line} ${word}` : word;
      if (measureText(next) <= maxW) {
        line = next;
        continue;
      }
      if (line) lines.push(line);
      line = word;
      while (measureText(line) > maxW) {
        let cut = line.length - 1;
        while (cut > 1 && measureText(line.slice(0, cut)) > maxW) cut--;
        lines.push(line.slice(0, cut));
        line = line.slice(cut);
      }
    }
    lines.push(line);
  }
  return lines;
}
