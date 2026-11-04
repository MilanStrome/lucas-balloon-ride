// Parental gate: hold a button for 3 seconds, then answer a simple randomized sum.
import { button, h } from './dom';
import { t } from './i18n';

export const HOLD_MS = 3000;

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

/** Shows the gate over the current screen. Resolves true only if the adult passes both parts. */
export function parentalGate(host: HTMLElement): Promise<boolean> {
  if (open) return Promise.resolve(false);
  open = true;
  return new Promise((resolve) => {
    const q = makeQuestion(Math.random);
    const fill = h('div', { class: 'fill' });
    const holdBtn = h(
      'button',
      { class: 'btn blue hold-btn', type: 'button', 'data-testid': 'gate-hold' },
      fill,
      h('span', { text: t('gate.hold') }),
    );
    const question = h('p', {
      class: 'text',
      'data-testid': 'gate-question',
      text: t('gate.question', { a: q.a, b: q.b }),
    });
    const answers = h('div', { class: 'row' });
    question.hidden = true;
    answers.hidden = true;
    let done = false;
    const finish = (ok: boolean) => {
      if (done) return;
      done = true;
      open = false;
      cancelAnimationFrame(raf);
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
    let holdStart = -1;
    let raf = 0;
    const step = () => {
      if (holdStart < 0) return;
      const p = Math.min(1, (performance.now() - holdStart) / HOLD_MS);
      fill.style.width = `${p * 100}%`;
      if (p >= 1) {
        holdStart = -1;
        holdBtn.disabled = true;
        question.hidden = false;
        answers.hidden = false;
        answers.querySelector('button')?.focus();
        return;
      }
      raf = requestAnimationFrame(step);
    };
    const begin = (e: Event) => {
      e.preventDefault();
      if (holdBtn.disabled) return;
      holdStart = performance.now();
      raf = requestAnimationFrame(step);
    };
    const end = () => {
      if (holdStart >= 0) {
        holdStart = -1;
        fill.style.width = '0';
        cancelAnimationFrame(raf);
      }
    };
    holdBtn.addEventListener('pointerdown', begin);
    holdBtn.addEventListener('pointerup', end);
    holdBtn.addEventListener('pointerleave', end);
    holdBtn.addEventListener('pointercancel', end);
    holdBtn.addEventListener('keydown', (e) => {
      if ((e.key === 'Enter' || e.key === ' ') && !e.repeat) begin(e);
    });
    holdBtn.addEventListener('keyup', (e) => {
      if (e.key === 'Enter' || e.key === ' ') end();
    });
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
        holdBtn,
        question,
        answers,
        button(
          { icon: 'back', label: t('gate.cancel'), cls: 'secondary small', testId: 'gate-cancel' },
          () => finish(false),
        ),
      ),
    );
    host.append(overlay);
    holdBtn.focus();
  });
}
