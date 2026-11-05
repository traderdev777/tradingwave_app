/**
 * Runs before first paint so there is no light/dark flash.
 * Saved choice wins; otherwise follow the OS and keep following it live.
 */
const code = `(function(){try{var d=document.documentElement,s=localStorage.getItem('tw-theme'),m=matchMedia('(prefers-color-scheme: dark)');d.setAttribute('data-theme',s||(m.matches?'dark':'light'));if(!s&&m.addEventListener){m.addEventListener('change',function(e){if(!localStorage.getItem('tw-theme'))d.setAttribute('data-theme',e.matches?'dark':'light')})}}catch(e){document.documentElement.setAttribute('data-theme','light')}})();`;

export function ThemeScript() {
  return <script dangerouslySetInnerHTML={{ __html: code }} />;
}
