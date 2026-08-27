/**
 * LaTeX and Math Formatting Utilities for StudyBot AI
 * Converts LaTeX formulas, mathematical notation, and HTML entities into clean, readable Unicode representations
 */

/**
 * Decode common HTML entities and clean raw escapes
 */
export function cleanRawTextEntities(text: string): string {
  if (!text) return '';
  return text
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&nbsp;/g, ' ')
    .replace(/&times;/g, '×')
    .replace(/&divide;/g, '÷')
    .replace(/&plusmn;/g, '±')
    .replace(/&infin;/g, '∞')
    .replace(/&ne;/g, '≠')
    .replace(/&le;/g, '≤')
    .replace(/&ge;/g, '≥')
    .replace(/&approx;/g, '≈');
}

/**
 * Convert raw LaTeX / Math symbols into clean readable Unicode representations
 */
export function formatMathLatexToReadable(text: string): string {
  if (!text) return '';
  let res = text;

  // 0. Strip display/inline math delimiters first (\[ ... \] and \( ... \))
  res = res.replace(/\\\[([^]*?)\\\]/g, (_, inner) => inner.trim());
  res = res.replace(/\\\(([^]*?)\\\)/g, (_, inner) => inner.trim());

  // 1. Text styling inside LaTeX
  res = res.replace(/\\mathbf\{([^}]+)\}/g, '**$1**');
  res = res.replace(/\\boldsymbol\{([^}]+)\}/g, '**$1**');
  res = res.replace(/\\mathit\{([^}]+)\}/g, '*$1*');
  res = res.replace(/\\mathrm\{([^}]+)\}/g, '$1');
  res = res.replace(/\\operatorname\{([^}]+)\}/g, '$1');
  res = res.replace(/\\textnormal\{([^}]+)\}/g, '$1');
  res = res.replace(/\\text\{([^}]+)\}/g, '$1');
  res = res.replace(/\\textrm\{([^}]+)\}/g, '$1');
  res = res.replace(/\\textbf\{([^}]+)\}/g, '$1');
  res = res.replace(/\\textit\{([^}]+)\}/g, '$1');

  // 1.1 Unescape escaped LaTeX characters inside identifiers like pak\_bowo
  res = res.replace(/\\_/g, '_');
  res = res.replace(/\\%/g, '%');
  res = res.replace(/\\#/g, '#');
  res = res.replace(/\\&/g, '&');
  res = res.replace(/\\\$/g, '$');

  // 2. Blackboard / script font sets (must come before generic \mathXX)
  res = res.replace(/\\mathbb\{R\}/g, 'ℝ');
  res = res.replace(/\\mathbb\{N\}/g, 'ℕ');
  res = res.replace(/\\mathbb\{Z\}/g, 'ℤ');
  res = res.replace(/\\mathbb\{Q\}/g, 'ℚ');
  res = res.replace(/\\mathbb\{C\}/g, 'ℂ');
  res = res.replace(/\\mathbb\{P\}/g, 'ℙ');
  res = res.replace(/\\mathbb\{([^}]+)\}/g, '$1'); // fallback
  res = res.replace(/\\mathcal\{([^}]+)\}/g, '$1');
  res = res.replace(/\\mathscr\{([^}]+)\}/g, '$1');
  res = res.replace(/\\mathfrak\{([^}]+)\}/g, '$1');

  // 3. Vectors and Hat notations
  res = res.replace(/\\vec\{([^}]+)\}/g, '$1⃗');
  res = res.replace(/\\hat\{i\}|\\hat\{i\}/g, 'î');
  res = res.replace(/\\hat\{j\}|\\hat\{j\}/g, 'ĵ');
  res = res.replace(/\\hat\{k\}|\\hat\{k\}/g, 'k̂');
  res = res.replace(/\\hat\{([^}]+)\}/g, '$1̂');
  res = res.replace(/\\bar\{([^}]+)\}/g, '$1̄');
  res = res.replace(/\\dot\{([^}]+)\}/g, '$1̇');
  res = res.replace(/\\ddot\{([^}]+)\}/g, '$1̈');
  res = res.replace(/\\tilde\{([^}]+)\}/g, '$1̃');

  // 4. Fractions \frac{num}{den} -> (num / den)
  res = res.replace(/\\frac\s*\{([^}]+)\}\s*\{([^}]+)\}/g, '($1 / $2)');
  res = res.replace(/\\dfrac\s*\{([^}]+)\}\s*\{([^}]+)\}/g, '($1 / $2)');
  res = res.replace(/\\tfrac\s*\{([^}]+)\}\s*\{([^}]+)\}/g, '($1 / $2)');

  // 5. Square roots \sqrt{x} -> √(x), \sqrt[n]{x} -> ⁿ√(x)
  res = res.replace(/\\sqrt\s*\[([^\]]+)\]\s*\{([^}]+)\}/g, '$1√($2)');
  res = res.replace(/\\sqrt\s*\{([^}]+)\}/g, '√($1)');

  // 6. Trig & Math Functions (strip backslashes)
  res = res.replace(/\\(sin|cos|tan|cot|sec|csc|arcsin|arccos|arctan|sinh|cosh|tanh|log|ln|exp|lim|det|max|min|sup|inf|gcd|lcm|deg|dim|ker|hom|arg)\b/g, '$1');

  // 7. Spacing
  res = res.replace(/\\quad|\\qquad|\\,|\\;|\\:|\\!/g, ' ');
  res = res.replace(/\\ /g, ' ');

  // 8. Delimiters: \left and \right with various bracket types
  res = res.replace(/\\left\s*\\\{/g, '{');
  res = res.replace(/\\right\s*\\\}/g, '}');
  res = res.replace(/\\left\s*\[/g, '[');
  res = res.replace(/\\right\s*\]/g, ']');
  res = res.replace(/\\left\s*\(/g, '(');
  res = res.replace(/\\right\s*\)/g, ')');
  res = res.replace(/\\left\s*\|/g, '|');
  res = res.replace(/\\right\s*\|/g, '|');
  res = res.replace(/\\left\s*\\lvert/g, '|');
  res = res.replace(/\\right\s*\\rvert/g, '|');
  res = res.replace(/\\left\s*\\langle/g, '⟨');
  res = res.replace(/\\right\s*\\rangle/g, '⟩');
  res = res.replace(/\\left\s*\\lfloor/g, '⌊');
  res = res.replace(/\\right\s*\\rfloor/g, '⌋');
  res = res.replace(/\\left\s*\\lceil/g, '⌈');
  res = res.replace(/\\right\s*\\rceil/g, '⌉');
  res = res.replace(/\\left\s*\./g, '');  // \left. (invisible)
  res = res.replace(/\\right\s*\./g, ''); // \right.
  res = res.replace(/\\left\b/g, '');     // generic \left
  res = res.replace(/\\right\b/g, '');    // generic \right
  res = res.replace(/\\\{/g, '{');        // standalone \{ -> {
  res = res.replace(/\\\}/g, '}');        // standalone \} -> }
  res = res.replace(/≤ft\s*\\?\{/g, '{'); // fix legacy corrupted text from old parser
  res = res.replace(/≤ft\b/g, '');

  // 9. Middle/Separators
  res = res.replace(/\\middle\s*\|/g, ' | ');
  res = res.replace(/\\middle\s*\\\|/g, ' ‖ ');
  res = res.replace(/\\mid\b/g, ' | ');
  res = res.replace(/\\lvert|\\rvert/g, '|');
  res = res.replace(/\\langle/g, '⟨');
  res = res.replace(/\\rangle/g, '⟩');
  res = res.replace(/\\lfloor/g, '⌊');
  res = res.replace(/\\rfloor/g, '⌋');
  res = res.replace(/\\lceil/g, '⌈');
  res = res.replace(/\\rceil/g, '⌉');
  res = res.replace(/\\vert/g, '|');
  res = res.replace(/\\Vert/g, '‖');

  // 10. Math, Logic & Discrete Mathematics Operators
  res = res
    // Logic Operators
    .replace(/\\land|\\wedge/g, ' ∧ ')
    .replace(/\\lor|\\vee/g, ' ∨ ')
    .replace(/\\neg|\\lnot/g, '¬')
    .replace(/\\top\b/g, '⊤')
    .replace(/\\bot\b/g, '⊥')
    .replace(/\\models|\\vDash/g, ' ⊨ ')
    .replace(/\\nVDash|\\nvDash|\\nvdash/g, ' ⊭ ')
    .replace(/\\vdash/g, ' ⊢ ')
    .replace(/\\dashv/g, ' ⊣ ')
    .replace(/\\oplus|\\veebar/g, ' ⊕ ')
    .replace(/\\otimes/g, ' ⊗ ')
    .replace(/\\nexists/g, '∄')
    .replace(/\\exists/g, '∃')
    .replace(/\\forall/g, '∀')

    // Arrows & Implications
    .replace(/\\iff|\\Leftrightarrow|\\Longleftrightarrow/g, ' ⇔ ')
    .replace(/\\implies|\\Rightarrow|\\Longrightarrow/g, ' ⇒ ')
    .replace(/\\Leftarrow|\\Longleftarrow/g, ' ⇐ ')
    .replace(/\\to|\\rightarrow|\\longrightarrow/g, ' → ')
    .replace(/\\leftarrow|\\gets|\\longleftarrow/g, ' ← ')
    .replace(/\\leftrightarrow|\\longleftrightarrow/g, ' ↔ ')
    .replace(/\\mapsto|\\longmapsto/g, ' ↦ ')

    // Arithmetic & Relations
    .replace(/\\times/g, '×')
    .replace(/\\div/g, '÷')
    .replace(/\\pm/g, '±')
    .replace(/\\mp/g, '∓')
    .replace(/\\approx/g, '≈')
    .replace(/\\leq|\\le\b/g, '≤')
    .replace(/\\geq|\\ge\b/g, '≥')
    .replace(/\\neq|\\ne\b/g, '≠')
    .replace(/\\equiv/g, '≡')
    .replace(/\\propto/g, '∝')
    .replace(/\\infty/g, '∞')
    .replace(/\\sum/g, '∑')
    .replace(/\\prod/g, '∏')
    .replace(/\\int/g, '∫')
    .replace(/\\iint/g, '∬')
    .replace(/\\iiint/g, '∭')
    .replace(/\\oint/g, '∮')
    .replace(/\\cdot/g, '·')
    .replace(/\\cdots/g, '···')
    .replace(/\\ldots/g, '...')
    .replace(/\\circ/g, '∘')
    .replace(/\\bullet/g, '•')
    
    // Set Theory
    .replace(/\\notin|\\not\\in/g, ' ∉ ')
    .replace(/\\in\b/g, ' ∈ ')
    .replace(/\\subset\b/g, ' ⊂ ')
    .replace(/\\subseteq/g, ' ⊆ ')
    .replace(/\\supset\b/g, ' ⊃ ')
    .replace(/\\supseteq/g, ' ⊇ ')
    .replace(/\\cup/g, ' ∪ ')
    .replace(/\\cap/g, ' ∩ ')
    .replace(/\\setminus/g, ' ∖ ')
    .replace(/\\complement/g, '∁')
    .replace(/\\emptyset|\\varnothing/g, '∅')

    // Symbols
    .replace(/\\nabla/g, '∇')
    .replace(/\\partial/g, '∂')
    .replace(/\\hbar/g, 'ℏ')
    .replace(/\\ell/g, 'ℓ')
    .replace(/\\Re\b/g, 'ℜ')
    .replace(/\\Im\b/g, 'ℑ')
    .replace(/\\aleph/g, 'ℵ')
    .replace(/\\perp/g, '⊥')
    .replace(/\\parallel/g, '∥')
    .replace(/\\angle/g, '∠')
    .replace(/\\triangle/g, '△')
    .replace(/\\therefore/g, '∴')
    .replace(/\\because/g, '∵')
    .replace(/\\sim|\\thicksim/g, '∼')
    .replace(/\\simeq/g, '≃')
    .replace(/\\cong/g, '≅')
    .replace(/\\not=/g, '≠')
    .replace(/\\backslash/g, '\\');

  // 11. Greek letters
  res = res
    .replace(/\\alpha/g, 'α')
    .replace(/\\beta/g, 'β')
    .replace(/\\gamma/g, 'γ')
    .replace(/\\Gamma/g, 'Γ')
    .replace(/\\delta/g, 'δ')
    .replace(/\\Delta/g, 'Δ')
    .replace(/\\epsilon|\\varepsilon/g, 'ε')
    .replace(/\\zeta/g, 'ζ')
    .replace(/\\eta/g, 'η')
    .replace(/\\theta|\\vartheta/g, 'θ')
    .replace(/\\Theta/g, 'Θ')
    .replace(/\\iota/g, 'ι')
    .replace(/\\kappa/g, 'κ')
    .replace(/\\lambda/g, 'λ')
    .replace(/\\Lambda/g, 'Λ')
    .replace(/\\mu/g, 'μ')
    .replace(/\\nu/g, 'ν')
    .replace(/\\xi/g, 'ξ')
    .replace(/\\Xi/g, 'Ξ')
    .replace(/\\pi|\\varpi/g, 'π')
    .replace(/\\Pi/g, 'Π')
    .replace(/\\rho|\\varrho/g, 'ρ')
    .replace(/\\sigma|\\varsigma/g, 'σ')
    .replace(/\\Sigma/g, 'Σ')
    .replace(/\\tau/g, 'τ')
    .replace(/\\upsilon/g, 'υ')
    .replace(/\\Upsilon/g, 'Υ')
    .replace(/\\phi|\\varphi/g, 'φ')
    .replace(/\\Phi/g, 'Φ')
    .replace(/\\chi/g, 'χ')
    .replace(/\\psi/g, 'ψ')
    .replace(/\\Psi/g, 'Ψ')
    .replace(/\\omega/g, 'ω')
    .replace(/\\Omega/g, 'Ω');

  // 12. Subscripts
  res = res
    .replace(/_x\b/g, 'x')
    .replace(/_y\b/g, 'y')
    .replace(/_z\b/g, 'z')
    .replace(/_0\b/g, '₀')
    .replace(/_1\b/g, '₁')
    .replace(/_2\b/g, '₂')
    .replace(/_3\b/g, '₃')
    .replace(/_4\b/g, '₄')
    .replace(/_5\b/g, '₅')
    .replace(/_6\b/g, '₆')
    .replace(/_7\b/g, '₇')
    .replace(/_8\b/g, '₈')
    .replace(/_9\b/g, '₉')
    .replace(/_i\b/g, 'ᵢ')
    .replace(/_j\b/g, 'ⱼ')
    .replace(/_k\b/g, 'ₖ')
    .replace(/_n\b/g, 'ₙ')
    .replace(/_m\b/g, 'ₘ')
    .replace(/_t\b/g, 'ₜ')
    .replace(/_\{([^}]+)\}/g, '_$1');

  // 13. Exponents
  res = res
    .replace(/\^0/g, '⁰')
    .replace(/\^1/g, '¹')
    .replace(/\^2/g, '²')
    .replace(/\^3/g, '³')
    .replace(/\^4/g, '⁴')
    .replace(/\^5/g, '⁵')
    .replace(/\^6/g, '⁶')
    .replace(/\^7/g, '⁷')
    .replace(/\^8/g, '⁸')
    .replace(/\^9/g, '⁹')
    .replace(/\^n/g, 'ⁿ')
    .replace(/\^\{([^}]+)\}/g, '^$1');

  // 14. Remove remaining lone backslash commands that weren't matched
  res = res.replace(/\\(?:[a-zA-Z]+)\b/g, '');

  // 15. Clean standalone $ and $$ math wrappers
  res = res.replace(/\$\$([^$]+)\$\$/g, '$1').replace(/\$([^$\n]+)\$/g, '$1');

  // 16. Clean up extra braces {} left over
  res = res.replace(/\{([^{}]*)\}/g, '$1');

  return res;
}
