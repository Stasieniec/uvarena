// Vite's `?raw` imports (the Worker reads public/_headers this way).
declare module "*?raw" {
  const text: string;
  export default text;
}
