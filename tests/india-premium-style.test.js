import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';

const stylesheet = new URL('../public/india-premium.css', import.meta.url);
const css = () => readFileSync(stylesheet, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');

// Source-only contract checks: browser geometry/cascade is an integration gate.
function rules() {
  const result = [];
  const stack = [];
  const source = css();
  const tokens = /([^{}]+)\{|\}/g;
  let match;
  while ((match = tokens.exec(source))) {
    if (match[1]) {
      const header = match[1].trim();
      stack.push(header);
      if (!header.startsWith('@')) {
        const end = source.indexOf('}', tokens.lastIndex);
        result.push({
          selectors: header.split(',').map(value => value.trim()),
          media: stack.filter(value => value.startsWith('@')).join(' '),
          declarations: Object.fromEntries(source.slice(tokens.lastIndex, end).split(';')
            .map(value => value.trim()).filter(Boolean).map(value => {
              const colon = value.indexOf(':');
              return [value.slice(0, colon).trim(), value.slice(colon + 1).trim()];
            })),
        });
      }
    } else stack.pop();
  }
  return result;
}
function declaration(selector, property, media = '') {
  const matching = rules().filter(rule => rule.selectors.includes(selector) && rule.media === media);
  return matching.reduce((value, rule) => rule.declarations[property] ?? value, undefined);
}

test('premium layer exists, is app-scoped, and keeps the approved local palette', () => {
  assert.ok(existsSync(stylesheet), 'new public/india-premium.css must exist');
  assert.equal(declaration('body.india-app', '--india-navy'), '#06153f');
  assert.equal(declaration('body.india-app', '--india-red'), '#f31b0c');
  assert.equal(declaration('body.india-app', '--navy'), 'var(--india-navy)');
  assert.equal(declaration('body.india-app', '--red'), undefined, 'retain semantic danger red');
  for (const rule of rules()) {
    for (const selector of rule.selectors) assert.ok(selector.startsWith('body.india-app'), selector);
  }
  assert.doesNotMatch(css(), /@import|https?:|@font-face|backdrop-filter/i);
  assert.match(declaration('body.india-app', 'font-family'), /Inter/);
});

test('desktop composition has a transparent mascot, wide composer, six tiles and fixed five-way navigation', () => {
  assert.equal(declaration('body.india-app .shell', 'max-width'), '1350px');
  assert.equal(declaration('body.india-app .india-header-inner', 'max-width'), '1450px');
  assert.equal(declaration('body.india-app .india-hero-mascot', 'height'), '250px');
  for (const selector of ['body.india-app .india-hero-mascot', 'body.india-app .india-avatar', 'body.india-app .india-portrait']) {
    assert.equal(declaration(selector, 'background'), 'transparent');
    assert.equal(declaration(selector, 'mask'), 'none');
    assert.equal(declaration(selector, 'border-radius'), '0');
    assert.equal(declaration(selector, 'object-fit'), 'contain');
  }
  assert.equal(declaration('body.india-app .india-question-form', 'max-width'), '1100px');
  assert.equal(declaration('body.india-app .india-question-form', 'min-height'), '78px');
  assert.equal(declaration('body.india-app .india-service-grid', 'grid-template-columns'), 'repeat(6, minmax(0, 1fr))');
  assert.equal(declaration('body.india-app .india-service-card', 'min-height'), '144px');
  assert.equal(declaration('body.india-app .india-navigation', 'position'), 'fixed');
  assert.equal(declaration('body.india-app .india-navigation', 'grid-template-columns'), 'repeat(5, minmax(0, 1fr))');
  assert.equal(declaration('body.india-app .india-navigation button.active', 'background'), 'var(--india-navy)');
  assert.equal(declaration('body.india-app .india-navigation button[aria-current="page"]', 'color'), '#fff');
  assert.equal(declaration('body.india-app .india-service-urgent > svg', 'color'), 'var(--india-red)');
  assert.equal(declaration('body.india-app .india-service-urgent::after', 'bottom'), '0');
  assert.equal(declaration('body.india-app #india-quick-help', 'display'), 'inline-flex');
  assert.equal(declaration('body.india-app #india-quick-help', 'min-height'), '44px');
});

test('tablet and mobile retain readable tiles, safe-area navigation and 44px controls', () => {
  const tablet = '@media (max-width: 1000px)';
  const mobile = '@media (max-width: 600px)';
  assert.equal(declaration('body.india-app .india-service-grid', 'grid-template-columns', tablet), 'repeat(3, minmax(0, 1fr))');
  assert.equal(declaration('body.india-app .india-hero-mascot', 'height', tablet), '180px');
  assert.equal(declaration('body.india-app .india-brand-tagline', 'display', tablet), 'none');
  assert.equal(declaration('body.india-app .india-hero-mascot', 'height', mobile), '120px');
  assert.equal(declaration('body.india-app .india-hero-title', 'font-size', mobile), 'clamp(26px, 7.5vw, 32px)');
  assert.equal(declaration('body.india-app .india-question-form', 'min-height', mobile), '56px');
  assert.equal(declaration('body.india-app .india-question-form', 'width', mobile), '100%');
  assert.equal(declaration('body.india-app .india-service-card', 'min-height', mobile), '108px');
  assert.equal(declaration('body.india-app .india-navigation button', 'min-height', mobile), '58px');
  assert.equal(declaration('body.india-app .india-send', 'min-height', mobile), '44px');
  assert.equal(declaration('body.india-app .india-header-inner .icon-button', 'min-height', mobile), '44px');
  assert.match(declaration('body.india-app .india-navigation', 'padding', mobile), /env\(safe-area-inset-bottom\)/);
  assert.match(declaration('body.india-app .shell', 'padding-bottom', mobile), /env\(safe-area-inset-bottom\)/);
  assert.equal(declaration('body.india-app #india-quick-help', 'display', mobile), undefined, 'never hide emergency shortcut');
});

test('short desktop home keeps room for legacy status and mobile panels stack', () => {
  assert.equal(declaration('body.india-app .india-hero-mascot', 'height', '@media (min-width: 1001px) and (max-height: 900px)'), '220px');
  assert.equal(declaration('body.india-app .india-history-cards', 'grid-template-columns', '@media (max-width: 600px)'), 'minmax(0, 1fr)');
  assert.equal(declaration('body.india-app .india-panel', 'padding', '@media (max-width: 600px)'), '20px');
});

test('screen lifecycle, legacy form visibility, honest panels and accessibility remain protected', () => {
  assert.equal(declaration('body.india-app [hidden]', 'display'), 'none !important');
  assert.equal(declaration('body.india-app .india-legacy-tabs', 'display'), 'none !important');
  assert.equal(declaration('body.india-app .shell #directory:not([hidden]) .search-panel', 'display'), 'block');
  assert.equal(declaration('body.india-app .india-history-cards', 'display'), 'grid');
  assert.equal(declaration('body.india-app .india-panel', 'background'), '#fff');
  assert.equal(declaration('body.india-app .india-menu-panel', 'position'), 'absolute');
  assert.equal(declaration('body.india-app .india-menu-panel button', 'min-height'), '44px');
  assert.equal(declaration('body.india-app button:focus-visible', 'outline'), '3px solid #996000');
  assert.equal(declaration('body.india-app *', 'transition', '@media (prefers-reduced-motion: reduce)'), 'none !important');
  assert.equal(declaration('body.india-app *', 'animation', '@media (prefers-reduced-motion: reduce)'), 'none !important');
  for (const rule of rules()) {
    if (rule.declarations.display?.startsWith('none')) {
      for (const selector of rule.selectors) assert.ok([
        'body.india-app [hidden]', 'body.india-app .india-legacy-tabs',
        'body.india-app .india-brand-tagline',
        'body.india-app[data-view="accueil"] .connection-line',
        'body.india-app[data-view="accueil"] .footer',
      ].includes(selector), `unexpected hidden control: ${selector}`);
    }
    assert.doesNotMatch(rule.selectors.join(' '), /\.warning|\.data-note|\.sos|\.urgent\b|#private-|#reset-chat|#confirm-call/);
    if (rule.declarations.content) assert.equal(rule.declarations.content, "''", 'no fabricated notification counts or product offers');
  }
});

test('always-accessible emergency shortcut has readable normal-text contrast',()=>{
 const resolve=value=>value.startsWith('var(')?declaration('body.india-app',value.slice(4,-1)):value;
 const lum=value=>{let hex=resolve(value).slice(1);if(hex.length===3)hex=[...hex].map(v=>v+v).join('');const linear=[0,2,4].map(i=>parseInt(hex.slice(i,i+2),16)/255).map(v=>v<=.04045?v/12.92:((v+.055)/1.055)**2.4);return linear.reduce((s,v,i)=>s+v*[.2126,.7152,.0722][i],0);};
 const selector='body.india-app #india-quick-help',a=lum(declaration(selector,'background')),b=lum(declaration(selector,'color'));
 assert.ok((Math.max(a,b)+.05)/(Math.min(a,b)+.05)>=4.5,'emergency normal text needs 4.5:1');
 assert.equal(declaration('body.india-app .header','position'),'sticky');assert.equal(declaration('body.india-app .header','top'),'0');
});

test('legacy full-bleed emergency margins cannot widen the new 320px viewport',()=>{
 assert.equal(declaration('body.india-app .emergency','margin-left'),'0');
 assert.equal(declaration('body.india-app .emergency','margin-right'),'0');
});
