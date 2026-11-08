/**
 * Dev-only resolve hooks: stand in for the DSH host modules the real Loader
 * injects. The llm stand-in re-exports the REAL 0.1.5 dsh-llm from the loomy
 * pnpm store so message constructors keep their exact shapes.
 */
export async function resolve(specifier, context, nextResolve) {
  if (specifier === '@deepseek-ai/dsh-llm') {
    return { url: new URL('./smoke-llm.mjs', import.meta.url).href, shortCircuit: true }
  }
  if (specifier === '@deepseek-ai/schemastery') {
    return { url: 'file:///E:/workspace/connection-all/loomy/dsh-loomy-connect/node_modules/.pnpm/@deepseek-ai+schemastery@3.18.2/node_modules/@deepseek-ai/schemastery/lib/index.mjs', shortCircuit: true }
  }
  if (specifier === '@deepseek-ai/dsh-home-paths') {
    return { url: new URL('./smoke-home-paths.mjs', import.meta.url).href, shortCircuit: true }
  }
  return nextResolve(specifier, context)
}
