// Parental gate: answer a simple randomized sum (one try per opening).
import { button, h } from './dom';
import { t } from './i18n';

export interface GateQuestion {
  a: number;
  b: number;
  answer: number;
  options: number[];
}

/** Pure: build a question and three distinct answer options from a random source. */
export function makeQuestion(rand: () => number): GateQuestion {
  const a = 3 + Math.floor(rand() * 7);
  const b = 2 + Math.floor(rand() * 7);
  const answer = a + b;
  const set = new Set<number>([answer]);
  while (set.size < 3) {
    const d = 1 + Math.floor(rand() * 4);
    set.add(rand() < 0.5 ? answer + d : Math.max(1, answer - d));
  }
  const options = [...set].sort(() => rand() - 0.5);
  return { a, b, answer, options };
}

let open = false;

/**
 * Shows the gate over the current screen. Resolves true only if the grown-up picks the right
 * answer; a wrong answer (or Back/Esc) closes it, so guessing gets one try per opening.
 */
export function parentalGate(host: HTMLElement): Promise<boolean> {
  if (open) return Promise.resolve(false);
  open = true;
  return new Promise((resolve) => {
    const q = makeQuestion(Math.random);
    const question = h('p', {
      class: 'text',
      'data-testid': 'gate-question',
      text: t('gate.question', { a: q.a, b: q.b }),
    });
    const answers = h('div', { class: 'row' });
    let done = false;
    const finish = (ok: boolean) => {
      if (done) return;
      done = true;
      open = false;
      window.removeEventListener('keydown', onKey, true);
      overlay.remove();
      resolve(ok);
    };
    for (const opt of q.options) {
      answers.append(
        button({ label: String(opt), cls: 'secondary', testId: `gate-answer-${opt}` }, () =>
          finish(opt === q.answer),
        ),
      );
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        e.preventDefault();
        finish(false);
      }
    };
    window.addEventListener('keydown', onKey, true);
    const overlay = h(
      'div',
      { class: 'overlay', role: 'dialog', 'aria-modal': 'true', 'data-testid': 'parental-gate' },
      h(
        'div',
        { class: 'card' },
        h('h2', { text: t('gate.title') }),
        question,
        answers,
        button(
          { icon: 'back', label: t('gate.cancel'), cls: 'secondary small', testId: 'gate-cancel' },
          () => finish(false),
        ),
      ),
    );
    host.append(overlay);
    answers.querySelector('button')?.focus();
  });
}
