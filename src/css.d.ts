// CSS files are imported as text strings (esbuild `text` loader) for Shadow-DOM
// style injection.
declare module '*.css' {
  const content: string;
  export default content;
}
