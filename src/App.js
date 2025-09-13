import { useEffect, useReducer, useMemo, useState, useCallback, useRef } from 'react';
import { createPortal } from 'react-dom';

const isOperator = (c) => ['+', '-', '*', '/', '%', '^'].includes(c);
const precedence = { '+': 1, '-': 1, '*': 2, '/': 2, '%': 2, '^': 3, '!': 4 };
const associativity = { '+': 'L', '-': 'L', '*': 'L', '/': 'L', '%': 'L', '^': 'R', '!': 'R' };
const functions = new Set(['sin', 'cos', 'tan', 'ln', 'log', 'sqrt']);

function tokenize(s) {
    const out = [];
    let i = 0;
    const n = Math.min(s.length, 1000);
    while (i < n) {
        const c = s[i];
        if (c === ' ') { i++; continue; }
        if ('()+-*/%^!'.includes(c)) { out.push(c); i++; continue; }
        if (c === 'π') { out.push('PI'); i++; continue; }
        if (c.toLowerCase() === 'e') { out.push('E'); i++; continue; }
        if (RE_ALPHA.test(c)) {
            let j = i + 1;
            while (j < n && RE_ALPHA.test(s[j])) j++;
            out.push(s.slice(i, j)); i = j; continue;
        }
        if (RE_NUM_OR_DOT.test(c)) {
            let j = i + 1, dot = (c === '.') ? 1 : 0;
            while (j < n) {
                const ch = s[j];
                if (ch === '.') { dot++; if (dot > 1) break; j++; continue; }
                if (ch >= '0' && ch <= '9') { j++; continue; }
                break;
            }
            out.push(s.slice(i, j)); i = j; continue;
        }
        throw new Error('Invalid character: ' + c);
    }
    return out;
}

function toRPN(tokens) {
    const out = [], st = []; let prev = null;
    for (let i = 0; i < tokens.length; i++) {
        let t = tokens[i];
        if (t === 'PI') { out.push(Math.PI.toString()); prev = 'num'; continue; }
        if (t === 'E') { out.push(Math.E.toString()); prev = 'num'; continue; }
        if (functions.has(t)) { st.push(t); prev = 'func'; continue; }
        if (!isNaN(t)) { out.push(t); prev = 'num'; continue; }
        if (t === '(') { st.push(t); prev = 'open'; continue; }
        if (t === ')') {
            while (st.length && st[st.length - 1] !== '(') out.push(st.pop());
            if (!st.length) throw new Error('Mismatched');
            st.pop();
            if (st.length && functions.has(st[st.length - 1])) out.push(st.pop());
            prev = 'close';
            continue;
        }
        if (t === '-' && (prev === null || prev === 'op' || prev === 'open')) { out.push('0'); }
        if (t === '!') {
            while (st.length) {
                const top = st[st.length - 1];
                if ((top in precedence) && ((associativity['!'] === 'L' && precedence['!'] <= precedence[top]) || (associativity['!'] === 'R' && precedence['!'] < precedence[top]))) { out.push(st.pop()); } else break;
            }
            st.push('!'); prev = 'op'; continue;
        }
        if (isOperator(t)) {
            while (st.length) {
                const top = st[st.length - 1];
                if (((top in precedence)) && ((associativity[t] === 'L' && precedence[t] <= precedence[top]) || (associativity[t] === 'R' && precedence[t] < precedence[top]))) { out.push(st.pop()); } else break;
            }
            st.push(t); prev = 'op'; continue;
        }
        throw new Error('Token');
    }
    while (st.length) { const x = st.pop(); if (x === '(') throw new Error('Mismatched'); out.push(x); }
    return out;
}


function snapUnit(x) {
    const eps = 1e-12;
    if (Math.abs(x) < eps) return 0;
    if (Math.abs(1 - Math.abs(x)) < eps) return Math.sign(x) >= 0 ? 1 : -1;
    return x;
}

function prettyNumber(x) {
    if (!Number.isFinite(x)) return 'Error';
    const eps = 1e-12;
    const ri = Math.round(x);
    if (Math.abs(x - ri) < eps) return String(ri);
    const rh = Math.round(x * 2) / 2;
    if (Math.abs(x - rh) < eps) return String(rh);
    let s = Number(x).toPrecision(12);
    const n = Number(s);
    if (Math.abs(n) >= 1e-6 && Math.abs(n) < 1e12) s = String(n);
    if (s.includes('.')) s = s.replace(/\.0+$/, '').replace(/(\.\d*?[1-9])0+$/, '$1').replace(/\.$/, '');
    return s;
}

function factorial(n) { if (n < 0 || !Number.isFinite(n)) return NaN; let k = Math.floor(n); if (Math.abs(n - k) > 1e-12) return NaN; let r = 1; for (let i = 2; i <= k; i++) r *= i; return r; }

function evalRPN(rpn, angleMode) {
    const st = [];
    for (const t of rpn) {
        if (!isNaN(t)) { st.push(parseFloat(t)); continue; }
        if (functions.has(t)) {
            const a = st.pop(); if (a === undefined) throw new Error('Fn');
            const d = angleMode === 'DEG' ? a * Math.PI / 180 : a;
            if (t === 'sin') st.push(snapUnit(Math.sin(d)));
            else if (t === 'cos') st.push(snapUnit(Math.cos(d)));
            else if (t === 'tan') {
                const c = Math.cos(d);
                if (Math.abs(c) < 1e-12) { st.push(NaN); }
                else { st.push(Math.tan(d)); }
            }
            else if (t === 'ln') st.push(Math.log(a));
            else if (t === 'log') st.push(Math.log10(a));
            else if (t === 'sqrt') st.push(Math.sqrt(a));
            else throw new Error('Fn');
            continue;
        }
        if (t === '!') {
            const a = st.pop(); if (a === undefined) throw new Error('Bang');
            st.push(factorial(a));
            continue;
        }
        const b = st.pop(), a = st.pop(); if (a === undefined || b === undefined) throw new Error('Op');
        if (t === '+') st.push(a + b);
        else if (t === '-') st.push(a - b);
        else if (t === '*') st.push(a * b);
        else if (t === '/') st.push(b === 0 ? NaN : a / b);
        else if (t === '%') st.push(a * b / 100);
        else if (t === '^') st.push(Math.pow(a, b));
        else throw new Error('Op');
    }
    if (st.length !== 1) throw new Error('Bad');
    return st[0];
}

function safeEval(expr, angleMode) {
    if (!expr) return 0;
    const cleaned = expr.replace(/\s+/g, '').replace(/×/g, '*').replace(/÷/g, '/').slice(0, 1000);
    const tokens = tokenize(cleaned);
    const rpn = toRPN(tokens);
    const val = evalRPN(rpn, angleMode);
    if (!isFinite(val)) throw new Error('Invalid');
    return val;
}

const INPUT_MAX_LEN = 256;
const opsForInput = ['+', '-', '*', '/', '%', '^', '.', '(', ')', '!'];

const initialState = (() => {
    let hist = []; try { const s = localStorage.getItem('calc_history'); if (s) hist = JSON.parse(s); } catch { }
    hist = Array.isArray(hist) ? hist.slice(0, 5) : [];
    return { expr: '', preview: '', warning: '', showSci: false, angle: 'RAD', showHist: false, history: hist, activeOp: '', showHelp: false };
})();

function reducer(state, action) {
    switch (action.type) {
        case 'APPEND': {
            let v = action.value;
            if (state.expr.length >= INPUT_MAX_LEN) return { ...state, warning: 'Input too long' };
            if (state.expr === '' && ['+', '*', '/', '%', '^', '.', '!'].includes(v)) return state;
            if (v === '.' && (state.expr === '' || RE_TRAILING_OP.test(state.expr))) v = '0.';
            if (isOperator(v) && isOperator(state.expr.slice(-1))) { if (!(v === '-' && state.expr.slice(-1) === '(')) return state; }
            if (v === '.') {
                const lastToken = state.expr.split(RE_SPLIT_OPS).pop();
                if (lastToken && lastToken.includes('.')) return state;
            }
            const next = state.expr + v;
            return { ...state, expr: next, warning: '', activeOp: isOperator(v) ? v : (isOperator(state.expr.slice(-1)) ? state.activeOp : '') };
        }
        case 'DEL': {
            if (!state.expr) return state;
            const next = state.expr.slice(0, -1);
            const last = next.slice(-1);
            return { ...state, expr: next, warning: '', activeOp: isOperator(last) ? last : '' };
        }
        case 'CLEAR':
            return { ...state, expr: '', preview: '', warning: '', activeOp: '' };
        case 'EQUALS': {
            try {
                const value = safeEval(state.expr, state.angle);
                const formatted = prettyNumber(value);
                const item = { expr: state.expr, result: formatted, ts: Date.now() };
                const history = [item, ...state.history].slice(0, 5);
                return { ...state, expr: formatted, preview: '', warning: '', history, activeOp: '' };
            } catch (e) {
                return { ...state, warning: 'Error', preview: '', activeOp: '' };
            }
        }
        case 'PREVIEW': {
            if (!state.expr) return { ...state, preview: '', warning: '', activeOp: '' };
            try { const value = safeEval(state.expr, state.angle); return { ...state, preview: prettyNumber(value), warning: '', activeOp: state.activeOp }; }
            catch { return { ...state, preview: '', warning: '', activeOp: state.activeOp }; }
        }
        case 'TOGGLE_SCI':
            return { ...state, showSci: !state.showSci };
        case 'TOGGLE_ANGLE':
            return { ...state, angle: state.angle === 'RAD' ? 'DEG' : 'RAD' };
        case 'TOGGLE_HIST':
            return { ...state, showHist: !state.showHist };
        case 'SET_EXPR':
            return { ...state, expr: action.value, warning: '', activeOp: '' };
        case 'OPEN_HELP':
            return { ...state, showHelp: true };
        case 'CLOSE_HELP':
            return { ...state, showHelp: false };
        case 'TOGGLE_HELP':
            return { ...state, showHelp: !state.showHelp };
        case 'CLEAR_HISTORY': {
            const history = [];
            return { ...state, history };
        }
        case 'REMOVE_HISTORY': {
            const { ts } = action;
            const history = state.history.filter(it => it.ts !== ts);
            return { ...state, history };
        }
        default: return state;
    }
}

const RE_ALPHA = /[a-zA-Z]/;
const RE_NUM_OR_DOT = /[\d.]/;
const RE_SPLIT_OPS = /[+\-*/%^()!]/;
const RE_TRAILING_OP = /[+\-*/%^()!]\s*$/;

export default function App() {
    const [state, dispatch] = useReducer(reducer, initialState);
    const showHelpRef = useRef(state.showHelp);
    useEffect(() => { showHelpRef.current = state.showHelp; }, [state.showHelp]);
    const [isMobile, setIsMobile] = useState(false);
    useEffect(() => {
        if (typeof window === 'undefined' || !window.matchMedia) return;
        const mq = window.matchMedia('(max-width: 767px)');
        const onChange = (e) => setIsMobile(e.matches);
        setIsMobile(mq.matches);
        if (mq.addEventListener) mq.addEventListener('change', onChange);
        else mq.addListener(onChange);
        return () => { if (mq.removeEventListener) mq.removeEventListener('change', onChange); else mq.removeListener(onChange); };
    }, []);
    useEffect(() => {
        const t = setTimeout(() => dispatch({ type: 'PREVIEW' }), 120);
        return () => clearTimeout(t);
    }, [state.expr, state.angle]);
    useEffect(() => { try { localStorage.setItem('calc_history', JSON.stringify(state.history)); } catch { } }, [state.history]);
    useEffect(() => {
        const onKey = (e) => {
            const k = e.key;
            if (showHelpRef.current && k === 'Escape') {
                e.preventDefault();
                dispatch({ type: 'CLOSE_HELP' });
                return;
            }
            if ((k >= '0' && k <= '9') || opsForInput.includes(k)) dispatch({ type: 'APPEND', value: k });
            else if (k === 'Enter') dispatch({ type: 'EQUALS' });
            else if (k === 'Backspace') dispatch({ type: 'DEL' });
            else if (k === 'Escape') dispatch({ type: 'CLEAR' });
            else if ((e.ctrlKey || e.metaKey) && k.toLowerCase() === 'v') {
                navigator.clipboard.readText().then(t => {
                    if (t) {
                        dispatch({ type: 'SET_EXPR', value: t });
                        setTimeout(() => dispatch({ type: 'EQUALS' }), 0);
                    }
                });
            }
        };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, []);
    useEffect(() => {
        if (!document.getElementById('help-font-link')) {
            const link = document.createElement('link');
            link.id = 'help-font-link';
            link.rel = 'stylesheet';
            link.href = 'https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@400;600;700&display=swap';
            document.head.appendChild(link);
        }
        if (!document.getElementById('help-styles')) {
            const style = document.createElement('style');
            style.id = 'help-styles';
            style.textContent = `
            :root { --help-z: 9999; }
            .help-overlay { position: fixed; inset: 0; background: rgba(0,0,0,.5); z-index: calc(var(--help-z) - 1); display: flex; align-items: center; justify-content: center; padding: 1rem; }
            .help-modal { position: relative; width: min(720px, 95vw); max-height: 85vh; overflow: auto; background: #fff; color: #0a0a0a; border-radius: 16px; padding: 1.25rem 1.25rem 1rem; box-shadow: 0 20px 60px rgba(0,0,0,.35); font-family: 'Space Grotesk', system-ui, -apple-system, Segoe UI, Roboto, 'Helvetica Neue', Arial, 'Noto Sans', 'Apple Color Emoji','Segoe UI Emoji'; }
            .help-modal h3 { margin: 0 0 .75rem; font-size: 1.4rem; line-height: 1.2; }
            .help-modal p { margin: 0 0 .75rem; font-size: 0.98rem; }
            .help-modal ul { padding-left: 1.1rem; margin: .25rem 0 .75rem; }
            .help-close { position: absolute; top: .5rem; right: .5rem; border: none; background: transparent; font-size: 1.6rem; line-height: 1; cursor: pointer; padding: .25rem; }
            .kbd { display: inline-block; padding: 0 .4rem; border: 1px solid #ddd; border-bottom-width: 2px; border-radius: 6px; font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace; font-size: .85em; background: #fafafa; }
            `;
            document.head.appendChild(style);
        }
        // Tailwind CDN load & config
        if (!document.getElementById('tw-cdn')) {
            const tw = document.createElement('script');
            tw.id = 'tw-cdn';
            tw.src = 'https://cdn.tailwindcss.com';
            document.head.appendChild(tw);
        }
        if (!document.getElementById('tw-config')) {
            const cfg = document.createElement('script');
            cfg.id = 'tw-config';
            cfg.text = `tailwind.config = { theme: { extend: { colors: { accent: '#5b8cff' } } } }`;
            document.head.appendChild(cfg);
        }
    }, []);
    useEffect(() => {
        if (state.showHelp) {
            const prev = document.body.style.overflow;
            document.body.style.overflow = 'hidden';
            const t = setTimeout(() => {
                const btn = document.getElementById('help-close');
                if (btn) btn.focus();
            }, 0);
            return () => { document.body.style.overflow = prev; clearTimeout(t); };
        }
    }, [state.showHelp]);
    const copyText = useMemo(() => (state.preview || state.expr || ''), [state.preview, state.expr]);
    const press = useCallback((v) => dispatch({ type: 'APPEND', value: v }), []);
    const fpress = useCallback((name) => dispatch({ type: 'APPEND', value: name + '(' }), []);
    const copy = useCallback(() => { try { navigator.clipboard.writeText(copyText); } catch { } }, [copyText]);
    const pasteAndEval = useCallback(() => {
        navigator.clipboard.readText().then(t => {
            if (t) {
                dispatch({ type: 'SET_EXPR', value: t });
                setTimeout(() => dispatch({ type: 'EQUALS' }), 0);
            }
        });
    }, []);
    // Digit color map
    const digitColor = {
        1: 'bg-green-600',
        2: 'bg-green-600',
        3: 'bg-green-600',
        4: 'bg-green-600',
        5: 'bg-green-600',
        6: 'bg-green-600',
        7: 'bg-green-600',
        8: 'bg-green-600',
        9: 'bg-green-600',
        0: 'bg-green-600',
        dot: 'bg-green-600'
    };
    return (
        <div className='App min-h-screen bg-gradient-to-b from-slate-900 to-slate-950'>
            <div className={`calc-layout flex justify-center gap-6 pt-8 sm:pt-12 px-4 ${state.showHist && !isMobile ? 'md:pr-[22rem]' : ''}`}>
                <div className='calculator mx-auto w-full max-w-[560px] sm:rounded-xl p-3 sm:p-4 shadow-2xl bg-gradient-to-br from-slate-800 to-slate-900 text-slate-100'>
                    <h2 className='text-center text-slate-100 mb-2'>Calculator</h2>
                    <div className='display' id='display'>
                        <div className='plc2 text-3xl sm:text-4xl font-semibold tracking-tight font-mono break-words'>{state.expr || '0'}</div>
                        <div className='plc1 text-2xl sm:text-3xl text-slate-200 mt-1' aria-live="polite">{state.warning ? <span>{state.warning}</span> : <span>Ans: {state.preview || '0'}</span>}</div>
                        <div className='display-actions'>
                            <button id='copy' className='rounded-lg px-3 py-2 shadow transition active:translate-y-px' onClick={copy}>Copy</button>
                            <button id='paste' className='rounded-lg px-3 py-2 shadow transition active:translate-y-px' onClick={pasteAndEval}>Paste</button>
                        </div>
                    </div>
                    <div className='grid grid-cols-4 gap-2 mt-2'>
                        <button className='w-full h-12 sm:h-14 rounded-lg shadow transition active:translate-y-px bg-fuchsia-600 text-white hover:brightness-105' onClick={() => dispatch({ type: 'TOGGLE_SCI' })}>fx</button>
                        <button className='w-full h-12 sm:h-14 rounded-lg shadow transition active:translate-y-px bg-emerald-600 text-white hover:brightness-105' onClick={() => dispatch({ type: 'TOGGLE_ANGLE' })}>{state.angle}</button>
                        <button className='w-full h-12 sm:h-14 rounded-lg shadow transition active:translate-y-px bg-amber-600 text-white hover:brightness-105' id='delete' onClick={() => dispatch({ type: 'DEL' })}>DEL</button>
                        <button className='w-full h-12 sm:h-14 rounded-lg shadow transition active:translate-y-px bg-red-600 text-white hover:brightness-105' id='clear' onClick={() => dispatch({ type: 'CLEAR' })}>CLR</button>
                    </div>
                    <div className='grid grid-cols-4 gap-2 mt-2'>
                        {/* Row 1 */}
                        <button className='w-full h-14 rounded-lg bg-slate-700 text-white shadow active:translate-y-px' onClick={() => press('7')}>7</button>
                        <button className='w-full h-14 rounded-lg bg-slate-700 text-white shadow active:translate-y-px' onClick={() => press('8')}>8</button>
                        <button className='w-full h-14 rounded-lg bg-slate-700 text-white shadow active:translate-y-px' onClick={() => press('9')}>9</button>
                        <button className='w-full h-14 rounded-lg bg-slate-600 text-white shadow active:translate-y-px' onClick={() => press('/')}>÷</button>
                        {/* Row 2 */}
                        <button className='w-full h-14 rounded-lg bg-slate-700 text-white shadow active:translate-y-px' onClick={() => press('4')}>4</button>
                        <button className='w-full h-14 rounded-lg bg-slate-700 text-white shadow active:translate-y-px' onClick={() => press('5')}>5</button>
                        <button className='w-full h-14 rounded-lg bg-slate-700 text-white shadow active:translate-y-px' onClick={() => press('6')}>6</button>
                        <button className='w-full h-14 rounded-lg bg-slate-600 text-white shadow active:translate-y-px' onClick={() => press('*')}>×</button>
                        {/* Row 3 */}
                        <button className='w-full h-14 rounded-lg bg-slate-700 text-white shadow active:translate-y-px' onClick={() => press('1')}>1</button>
                        <button className='w-full h-14 rounded-lg bg-slate-700 text-white shadow active:translate-y-px' onClick={() => press('2')}>2</button>
                        <button className='w-full h-14 rounded-lg bg-slate-700 text-white shadow active:translate-y-px' onClick={() => press('3')}>3</button>
                        <button className='w-full h-14 rounded-lg bg-slate-600 text-white shadow active:translate-y-px' onClick={() => press('-')}>−</button>
                        {/* Row 4 */}
                        <button className='w-full h-14 rounded-lg bg-slate-700 text-white shadow active:translate-y-px col-span-2' onClick={() => press('0')}>0</button>
                        <button className='w-full h-14 rounded-lg bg-slate-700 text-white shadow active:translate-y-px' onClick={() => press('.')}>.</button>
                        <button className='w-full h-14 rounded-lg bg-slate-600 text-white shadow active:translate-y-px' onClick={() => press('+')}>+</button>
                        {/* Row 5 */}
                        <button className='w-full h-14 rounded-lg bg-slate-600 text-white shadow active:translate-y-px' onClick={() => press('%')}>%</button>
                        <button className='w-full h-14 rounded-lg bg-slate-600 text-white shadow active:translate-y-px' onClick={() => press('(')}>(</button>
                        <button className='w-full h-14 rounded-lg bg-slate-600 text-white shadow active:translate-y-px' onClick={() => press(')')}>)</button>
                        <button className='w-full h-14 rounded-lg bg-lime-500 text-black shadow font-semibold active:translate-y-px' onClick={() => dispatch({ type: 'EQUALS' })}>=</button>
                    </div>
                    {state.showSci && (
                        <div className='operators grid grid-cols-4 gap-2 mt-2'>
                            <button className='w-full h-12 sm:h-14 rounded-lg bg-slate-700 text-white shadow active:translate-y-px' onClick={() => fpress('sin')}>sin</button>
                            <button className='w-full h-12 sm:h-14 rounded-lg bg-slate-700 text-white shadow active:translate-y-px' onClick={() => fpress('cos')}>cos</button>
                            <button className='w-full h-12 sm:h-14 rounded-lg bg-slate-700 text-white shadow active:translate-y-px' onClick={() => fpress('tan')}>tan</button>
                            <button className='w-full h-12 sm:h-14 rounded-lg bg-slate-700 text-white shadow active:translate-y-px' onClick={() => fpress('ln')}>ln</button>
                            <button className='w-full h-12 sm:h-14 rounded-lg bg-slate-700 text-white shadow active:translate-y-px' onClick={() => fpress('log')}>log</button>
                            <button className='w-full h-12 sm:h-14 rounded-lg bg-slate-700 text-white shadow active:translate-y-px' onClick={() => fpress('sqrt')}>√</button>
                            <button className='w-full h-12 sm:h-14 rounded-lg bg-slate-700 text-white shadow active:translate-y-px' onClick={() => press('^')}>x^y</button>
                            <button className='w-full h-12 sm:h-14 rounded-lg bg-slate-700 text-white shadow active:translate-y-px' onClick={() => dispatch({ type: 'APPEND', value: '^2' })}>x²</button>
                            <button className='w-full h-12 sm:h-14 rounded-lg bg-slate-700 text-white shadow active:translate-y-px' onClick={() => press('!')}>!</button>
                            <button className='w-full h-12 sm:h-14 rounded-lg bg-slate-700 text-white shadow active:translate-y-px' onClick={() => press('π')}>π</button>
                            <button className='w-full h-12 sm:h-14 rounded-lg bg-slate-700 text-white shadow active:translate-y-px' onClick={() => press('e')}>e</button>
                        </div>
                    )}
                </div>
                {state.showHist && !isMobile && (<div className='md:hidden h-[44vh]' />)}
                {state.showHist && !isMobile && (
                    <aside className='fixed inset-x-4 bottom-24 z-[9000] rounded-xl bg-slate-800/90 text-slate-100 shadow-2xl backdrop-blur p-4 max-h-[40vh] overflow-y-auto md:inset-auto md:right-6 md:top-24 md:w-80 md:max-h-[65vh]'>
                        <div className='tape-head'>
                            <span className='font-semibold'>History</span>
                            <button className='btn-clear-hist btn-xs' onClick={() => dispatch({ type: 'CLEAR_HISTORY' })}>Clear</button>
                        </div>
                        <div className='tape-body mt-2 space-y-3 max-h-[65vh] overflow-y-auto pr-1'>
                            {state.history.length === 0 && <div className='tape-empty opacity-70'>No history</div>}
                            {state.history.map((it, idx) => (
                                <div key={it.ts + "-" + idx} className='tape-item border-b border-white/10 pb-2'>
                                    <div className='tape-expr text-sm opacity-80'>{it.expr}</div>
                                    <div className='tape-res font-mono'>{it.result}</div>
                                    <div className='tape-actions mt-1'>
                                        <button className='btn-xs rounded px-2 py-1 shadow' onClick={() => dispatch({ type: 'SET_EXPR', value: it.result })}>Use</button>
                                        <button className='btn-xs rounded px-2 py-1 shadow' onClick={() => dispatch({ type: 'SET_EXPR', value: state.expr + it.result })}>Append</button>
                                        <button className='btn-xs btn-danger rounded px-2 py-1 shadow' onClick={() => dispatch({ type: 'REMOVE_HISTORY', ts: it.ts })}>Remove</button>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </aside>
                )}
            </div>
            <button
                id='help-btn'
                aria-label={state.showHelp ? 'Close help' : 'Open help'}
                aria-haspopup='dialog'
                aria-expanded={state.showHelp}
                aria-controls='help-modal'
                title='Help'
                onClick={() => dispatch({ type: state.showHelp ? 'CLOSE_HELP' : 'OPEN_HELP' })}
                className='fixed bottom-5 right-5 z-[10000] inline-flex h-12 w-12 items-center justify-center rounded-full bg-accent font-extrabold text-white shadow-[0_10px_30px_rgba(0,0,0,.35),0_3px_8px_rgba(0,0,0,.25)] transition-transform duration-100 hover:brightness-105 hover:shadow-[0_12px_36px_rgba(0,0,0,.38),0_4px_10px_rgba(0,0,0,.26)] active:translate-y-px active:scale-[.98] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-white/75'
            >
                ?
            </button>
            {state.showHelp && createPortal(
                <div className='help-overlay' role='presentation' onClick={(e) => { if (e.target === e.currentTarget) dispatch({ type: 'CLOSE_HELP' }); }}>
                    <div id='help-modal' className='help-modal' role='dialog' aria-modal='true' aria-labelledby='help-title'>
                        <button id='help-close' className='help-close' aria-label='Close help' onClick={() => dispatch({ type: 'CLOSE_HELP' })}>×</button>
                        <h3 id='help-title'>Calculator Help & Features</h3>
                        <p>Welcome! This calculator supports standard and scientific operations. Preview updates live as you type, and your recent results are stored in the History tape.</p>
                        <ul>
                            <li><strong>Basic ops:</strong> +, −, ×, ÷, %, ^, parentheses, decimal.</li>
                            <li><strong>Scientific:</strong> <code>sin</code>, <code>cos</code>, <code>tan</code>, <code>ln</code>, <code>log</code>, <code>√</code>, factorial <code>!</code>, power <code>^</code>, constants π and e.</li>
                            <li><strong>Angle mode:</strong> toggle RAD/DEG with the <em>{`{state.angle}`}</em> button.</li>
                            <li><strong>Percent:</strong> <code>a % b</code> is evaluated as <code>a * b / 100</code>.</li>
                            <li><strong>Preview:</strong> live <em>Ans</em> shows the evaluated result of the current expression.</li>
                            <li><strong>History:</strong> open <em>Hist</em> to reuse or append past results.</li>
                            <li><strong>Keyboard:</strong> <span className='kbd'>Enter</span> = equals, <span className='kbd'>Backspace</span> = delete, <span className='kbd'>Esc</span> = clear, <span className='kbd'>Ctrl/⌘+V</span> = paste & auto‑evaluate.</li>
                            <li><strong>Shortcuts:</strong> type functions like <code>sin(</code>, <code>log(</code>, or use the <em>fx</em> panel.</li>
                        </ul>
                        <p>Tip: Use <em>Copy</em> to grab the current preview or expression. Click outside this window or press <span className='kbd'>Esc</span> to close.</p>
                    </div>
                </div>,
                document.body
            )}
        </div>
    );
}
