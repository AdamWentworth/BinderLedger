// TypeScript resolves this neutral module while Metro selects the platform-specific
// .native.tsx or .web.tsx implementation at bundle time.
export { CardCamera } from './card-camera-view.web';
