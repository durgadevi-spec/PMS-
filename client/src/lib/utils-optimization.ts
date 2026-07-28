/**
 * Performance optimization utilities
 */

/**
 * Debounce function - delays execution until N milliseconds have passed without invocation
 * Useful for search, scroll, and resize events
 */
export function debounce<T extends (...args: any[]) => any>(
  func: T,
  delay: number
): (...args: Parameters<T>) => void {
  let timeoutId: ReturnType<typeof setTimeout>;
  return function (...args: Parameters<T>) {
    clearTimeout(timeoutId);
    timeoutId = setTimeout(() => func(...args), delay);
  };
}

/**
 * Throttle function - ensures function runs at most once every N milliseconds
 * Useful for scroll and resize handlers
 */
export function throttle<T extends (...args: any[]) => any>(
  func: T,
  limit: number
): (...args: Parameters<T>) => void {
  let inThrottle: boolean;
  return function (...args: Parameters<T>) {
    if (!inThrottle) {
      func(...args);
      inThrottle = true;
      setTimeout(() => (inThrottle = false), limit);
    }
  };
}

/**
 * Memoize expensive computations with size limit
 */
export function memoize<T extends (...args: any[]) => any>(
  func: T,
  maxSize: number = 50
): T {
  const cache = new Map();

  return ((...args: any[]) => {
    const key = JSON.stringify(args);

    if (cache.has(key)) {
      return cache.get(key);
    }

    const result = func(...args);

    if (cache.size >= maxSize) {
      const firstKey = cache.keys().next().value;
      cache.delete(firstKey);
    }

    cache.set(key, result);
    return result;
  }) as T;
}

/**
 * Batch updates - group multiple state updates into a single render
 * Useful when updating multiple state variables from the same event
 */
export function batchUpdates(callback: () => void) {
  // In React 18+, updates inside event handlers are automatically batched
  // This is a no-op but kept for compatibility
  callback();
}

/**
 * CPU-efficient request animation frame-based scroll handler
 */
export function onScroll(element: HTMLElement, callback: () => void) {
  let frameId: number;
  const handleScroll = () => {
    cancelAnimationFrame(frameId);
    frameId = requestAnimationFrame(callback);
  };
  element.addEventListener("scroll", handleScroll, { passive: true });
  return () => element.removeEventListener("scroll", handleScroll);
}

/**
 * Intersection Observer helper for lazy loading
 */
export function observeElement(
  element: Element,
  callback: (visible: boolean) => void,
  options?: IntersectionObserverInit
) {
  const observer = new IntersectionObserver(([entry]) => {
    callback(entry.isIntersecting);
  }, options);

  observer.observe(element);
  return observer;
}

/**
 * Performance metric logger
 */
export function logPerformanceMetric(label: string, duration: number) {
  if (process.env.NODE_ENV === "development") {
    console.log(`⏱️  ${label}: ${duration.toFixed(2)}ms`);
  }
}

/**
 * Request idle callback polyfill for performance non-critical tasks
 */
export function scheduleIdleTask(callback: () => void) {
  if ("requestIdleCallback" in window) {
    requestIdleCallback(callback);
  } else {
    setTimeout(callback, 0);
  }
}
