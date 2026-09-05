import { SetMetadata } from '@nestjs/common';

export const IS_PUBLIC_KEY = 'brick-review:public';

/**
 * Opts a route out of the globally applied `AuthGuard`. Deliberately opt-out
 * rather than opt-in: a new controller is protected by default, so forgetting
 * the decorator locks a route down instead of leaking a collection.
 */
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);
