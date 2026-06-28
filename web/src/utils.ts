// Facade re-exported for shadcn-svelte components compatibility.
// shadcn generates imports like: import { cn, type WithElementRef } from "src/utils.js"

export type {
	WithElementRef,
	WithoutChild,
	WithoutChildren,
	WithoutChildrenOrChild
} from 'bits-ui';
export { cn } from 'src/utils/cn';
