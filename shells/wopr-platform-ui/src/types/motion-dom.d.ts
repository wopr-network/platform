/**
 * Ambient type declarations for motion-dom 12.x, framer-motion 12.x shims,
 * and process.env augmentation for Next.js/browser environments.
 *
 * motion-dom ships without bundled type declarations in some versions.
 * This stub satisfies the imports that framer-motion's types expect.
 * Remove this file once motion-dom ships with its own .d.ts files.
 */

declare module "motion-dom" {
  /** A motion value that can animate between values. */
  export class MotionValue<T = unknown> {
    get(): T;
    set(v: T): void;
    on(event: string, cb: (v: T) => void): () => void;
  }

  /** CSS transform property names that motion supports independently. */
  export interface TransformProperties {
    x?: number | string;
    y?: number | string;
    z?: number | string;
    rotate?: number | string;
    rotateX?: number | string;
    rotateY?: number | string;
    rotateZ?: number | string;
    scale?: number | string;
    scaleX?: number | string;
    scaleY?: number | string;
    skew?: number | string;
    skewX?: number | string;
    skewY?: number | string;
    originX?: number | string;
    originY?: number | string;
    originZ?: number | string;
    perspective?: number | string;
    translateX?: number | string;
    translateY?: number | string;
    translateZ?: number | string;
  }

  /** SVG path-specific animatable properties. */
  export interface SVGPathProperties {
    pathLength?: number;
    pathOffset?: number;
    pathSpacing?: number;
  }

  /** Target values for an animation — CSS properties plus transforms. */
  export type TargetAndTransition = Record<string, unknown>;

  /** A named set of animation states. */
  export type VariantLabels = string | string[];

  /** Transition configuration. */
  export type Transition = Record<string, unknown>;

  /** Bounding box used for drag constraints. */
  export interface BoundingBox {
    top: number;
    right: number;
    bottom: number;
    left: number;
  }

  /** Information about a pan/drag gesture. */
  export interface PanInfo {
    point: { x: number; y: number };
    delta: { x: number; y: number };
    offset: { x: number; y: number };
    velocity: { x: number; y: number };
  }

  /** The core animation props exposed by every motion element. */
  export interface MotionNodeOptions {
    /** Initial visual state — can be a variant name, object, or false. */
    initial?: boolean | TargetAndTransition | VariantLabels;
    /** Animation target — can be a variant name, object, or controls. */
    animate?: TargetAndTransition | VariantLabels;
    /** State to animate to when removed from the React tree (requires AnimatePresence). */
    exit?: TargetAndTransition | VariantLabels;
    /** Named animation variants. */
    // biome-ignore lint/suspicious/noExplicitAny: variant functions accept arbitrary custom args (e.g. stagger index)
    variants?: Record<string, TargetAndTransition | ((arg: any) => TargetAndTransition)>;
    /** Transition defaults for this element. */
    transition?: Transition;
    /** Animate when hovered. */
    whileHover?: TargetAndTransition | VariantLabels;
    /** Animate while focused. */
    whileFocus?: TargetAndTransition | VariantLabels;
    /** Animate while tapped / clicked. */
    whileTap?: TargetAndTransition | VariantLabels;
    /** Animate while dragging. */
    whileDrag?: TargetAndTransition | VariantLabels;
    /** Animate while element is in viewport. */
    whileInView?: TargetAndTransition | VariantLabels;
    /** Enable dragging. */
    drag?: boolean | "x" | "y";
    /** Drag constraints (ref or pixel values). */
    dragConstraints?: false | Partial<BoundingBox> | { current: Element | null };
    /** Drag elasticity (0 = rigid, 1 = full). */
    dragElastic?: boolean | number | Partial<BoundingBox>;
    /** Drag momentum. */
    dragMomentum?: boolean;
    /** Enable layout animations. */
    layout?: boolean | "position" | "size" | "preserve-aspect";
    /** Layout ID for shared-layout transitions. */
    layoutId?: string;
    /** Custom prop forwarding filter. */
    custom?: unknown;
    /** Called when animation starts. */
    onAnimationStart?: (definition: string) => void;
    /** Called when animation completes. */
    onAnimationComplete?: (definition: string) => void;
    /** Called when drag starts. */
    onDragStart?: (event: MouseEvent | TouchEvent | PointerEvent, info: PanInfo) => void;
    /** Called while dragging. */
    onDrag?: (event: MouseEvent | TouchEvent | PointerEvent, info: PanInfo) => void;
    /** Called when drag ends. */
    onDragEnd?: (event: MouseEvent | TouchEvent | PointerEvent, info: PanInfo) => void;
    /** Called when element enters viewport. */
    onViewportEnter?: (entry: IntersectionObserverEntry | null) => void;
    /** Called when element leaves viewport. */
    onViewportLeave?: (entry: IntersectionObserverEntry | null) => void;
    /** Inherited variant from parent. */
    inherit?: boolean;
    /** Viewport options for whileInView. */
    viewport?: {
      once?: boolean;
      root?: React.RefObject<Element>;
      margin?: string;
      amount?: "some" | "all" | number;
    };
  }

  export type ElementOrSelector = Element | string | NodeListOf<Element> | Element[];

  export type DOMKeyframesDefinition = Record<string, unknown>;

  export type AnimationOptions = Record<string, unknown>;

  export interface AnimationPlaybackControlsWithThen {
    then(resolve: () => void, reject?: () => void): Promise<void>;
    cancel(): void;
    complete(): void;
    pause(): void;
    play(): void;
    stop(): void;
  }

  export type AnimationPlaybackControls = AnimationPlaybackControlsWithThen;

  export type AnimationScope<T = Element> = {
    readonly current: T;
    animations: AnimationPlaybackControls[];
  };

  export type ValueAnimationTransition = Record<string, unknown>;

  export type NodeGroup = unknown;
  export type IProjectionNode = unknown;
}
