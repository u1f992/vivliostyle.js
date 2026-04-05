// Mock for @vivliostyle/lcms - not available in browser test environment
export default function createLcmsModule() {
  return Promise.resolve(null);
}
