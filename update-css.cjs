const fs = require('fs');
let css = fs.readFileSync('src/shared/design-system/index.base.css', 'utf8');

css = css.replace(/--radius-lg: 0rem;/g, '--radius-lg: 0.5rem;');
css = css.replace(/--radius-md: 0rem;/g, '--radius-md: 0.375rem;');
css = css.replace(/--radius-sm: 0rem;/g, '--radius-sm: 0.25rem;');
css = css.replace(/--radius-xl: 0rem;/g, '--radius-xl: 0.75rem;');
css = css.replace(/--radius-2xl: 0rem;/g, '--radius-2xl: 1rem;');

const newCSS = `
@layer base {
  body {
    background: linear-gradient(-45deg, hsl(var(--background)), #0a0a0a, #050505, hsl(var(--background)));
    background-size: 400% 400%;
    animation: gradientBG 15s ease infinite;
    -webkit-font-smoothing: antialiased;
    -moz-osx-font-smoothing: grayscale;
  }

  @keyframes gradientBG {
    0% { background-position: 0% 50%; }
    50% { background-position: 100% 50%; }
    100% { background-position: 0% 50%; }
  }

  svg.lucide {
    stroke-width: 1.5px !important;
    stroke-linecap: square !important;
    stroke-linejoin: miter !important;
  }
}

@layer components {
  .glass-brick {
    background: rgba(10, 10, 10, 0.4);
    backdrop-filter: blur(12px);
    border-radius: var(--radius-lg);
    border: 1px solid rgba(255, 255, 255, 0.05);
  }

  .cinematic-card {
    background: rgba(10, 10, 10, 0.5);
    backdrop-filter: blur(8px);
    box-shadow: inset 0 1px 1px rgba(255, 255, 255, 0.1), inset 0 -1px 3px rgba(0, 0, 0, 0.5), 0 4px 6px rgba(0, 0, 0, 0.3);
    border-radius: var(--radius-lg);
  }

  .border-gradient {
    position: relative;
    background-clip: padding-box;
    border: 1px solid transparent;
  }
  .border-gradient::before {
    content: '';
    position: absolute;
    inset: 0;
    z-index: -1;
    margin: -1px;
    border-radius: inherit;
    background: linear-gradient(to bottom, rgba(255,255,255,0.2), rgba(255,255,255,0.05));
  }

  .header-padding {
    padding-top: 1.5em;
    padding-bottom: 1.5em;
  }

  .tab-padding {
    padding-top: 1.3em;
    padding-bottom: 1.3em;
  }

  .btn-cinematic {
    transition: transform 0.15s cubic-bezier(0.4, 0, 0.2, 1);
  }
  .btn-cinematic:hover {
    transform: scale(1.05);
  }
  .btn-cinematic-text {
    display: inline-block;
    transition: transform 0.1s ease-out;
  }
  .btn-cinematic:hover .btn-cinematic-text {
    animation: btnTextScale 0.4s forwards;
  }
  
  @keyframes btnTextScale {
    0% { transform: scale(1); }
    40% { transform: scale(1.1); }
    100% { transform: scale(1.2); }
  }

  .content-gap {
    gap: 1.2em;
  }
  .inline-gap {
    gap: 0.7em;
  }
}
`;

fs.writeFileSync('src/shared/design-system/index.base.css', css + newCSS);
