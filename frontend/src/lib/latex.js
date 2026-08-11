// turns $...$ / $$...$$ LaTeX into plain readable text - used for copy/export, where
// pasting raw "$O(n^2)$" into a plain text field is just noise. not a full LaTeX parser,
// covers the common stuff (super/subscripts, greek letters, fractions, comparison signs)
const SUPERSCRIPT_MAP = {
  0: '⁰', 1: '¹', 2: '²', 3: '³', 4: '⁴', 5: '⁵', 6: '⁶', 7: '⁷', 8: '⁸', 9: '⁹',
  '+': '⁺', '-': '⁻', '=': '⁼', '(': '⁽', ')': '⁾', n: 'ⁿ', i: 'ⁱ',
}

const SUBSCRIPT_MAP = {
  0: '₀', 1: '₁', 2: '₂', 3: '₃', 4: '₄', 5: '₅', 6: '₆', 7: '₇', 8: '₈', 9: '₉',
  '+': '₊', '-': '₋', '=': '₌', '(': '₍', ')': '₎', a: 'ₐ', e: 'ₑ', o: 'ₒ', x: 'ₓ', n: 'ₙ',
}

const LATEX_COMMANDS = {
  '\\log': 'log', '\\ln': 'ln', '\\sin': 'sin', '\\cos': 'cos', '\\tan': 'tan',
  '\\infty': '∞', '\\sum': 'Σ', '\\int': '∫', '\\prod': '∏',
  '\\alpha': 'α', '\\beta': 'β', '\\gamma': 'γ', '\\delta': 'δ', '\\theta': 'θ',
  '\\lambda': 'λ', '\\mu': 'μ', '\\pi': 'π', '\\sigma': 'σ', '\\phi': 'φ', '\\omega': 'ω',
  '\\leq': '≤', '\\geq': '≥', '\\neq': '≠', '\\approx': '≈', '\\equiv': '≡',
  '\\times': '×', '\\cdot': '·', '\\pm': '±', '\\div': '÷',
  '\\rightarrow': '→', '\\to': '→', '\\Rightarrow': '⇒', '\\leftarrow': '←',
  '\\in': '∈', '\\notin': '∉', '\\subset': '⊂', '\\subseteq': '⊆', '\\cup': '∪', '\\cap': '∩',
  '\\forall': '∀', '\\exists': '∃', '\\partial': '∂', '\\nabla': '∇', '\\emptyset': '∅',
}

function toSuperscript(str) {
  return str.split('').map((ch) => SUPERSCRIPT_MAP[ch] ?? ch).join('')
}

function toSubscript(str) {
  return str.split('').map((ch) => SUBSCRIPT_MAP[ch] ?? ch).join('')
}

function flattenMathExpr(expr) {
  let out = expr
  out = out.replace(/\\frac\{([^{}]*)\}\{([^{}]*)\}/g, '$1/$2')
  out = out.replace(/\\sqrt\{([^{}]*)\}/g, '√$1')
  out = out.replace(/\^\{([^{}]*)\}/g, (_, g) => toSuperscript(g))
  out = out.replace(/\^([A-Za-z0-9+\-=()])/g, (_, g) => toSuperscript(g))
  out = out.replace(/_\{([^{}]*)\}/g, (_, g) => toSubscript(g))
  out = out.replace(/_([A-Za-z0-9+\-=()])/g, (_, g) => toSubscript(g))
  for (const [cmd, replacement] of Object.entries(LATEX_COMMANDS)) {
    out = out.split(cmd).join(replacement)
  }
  // anything left is an unrecognized command - drop the backslash but keep the word
  out = out.replace(/\\([a-zA-Z]+)/g, '$1')
  out = out.replace(/[{}]/g, '')
  return out.trim()
}

export function flattenLatex(text) {
  if (!text) return text
  let out = text.replace(/\$\$([\s\S]+?)\$\$/g, (_, expr) => flattenMathExpr(expr))
  out = out.replace(/\$([^$\n]+?)\$/g, (_, expr) => flattenMathExpr(expr))
  return out
}
