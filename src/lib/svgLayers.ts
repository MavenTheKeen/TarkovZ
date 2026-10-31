// Map SVGs hold one top-level <g id="..."> per floor. This draws a single
// floor by hiding the other groups with an injected style.

/** Object URL for the SVG with only the given top-level group shown. */
export function layerSvgUrl(svgText: string, show: string, keepWithGroup: boolean): string {
  const id = CSS.escape(show);
  const keep = keepWithGroup ? `:not([data-keep-with-group="${show.replace(/"/g, '')}"])` : '';
  const style = `<style>:root > g[id]:not(#${id})${keep} { display: none; }</style>`;
  const withStyle = svgText.replace(/<svg\b[^>]*>/, (tag) => `${tag}${style}`);
  return URL.createObjectURL(new Blob([withStyle], { type: 'image/svg+xml' }));
}
