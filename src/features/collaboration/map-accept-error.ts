// Map an accept-invitation failure to a user-facing toast message, keyed by the
// gateway HTTP status (see api/collaboration/02-accept.md error table):
//   403 suspended/removed · 404 invite gone · 409 not-invited-yet · else generic.

import type { ImageApiFailure } from '@/apis/image-api-client';

export function mapAcceptError(failure: ImageApiFailure): string {
  switch (failure.httpStatus) {
    case 403:
      return 'This collaboration was suspended or you were removed.';
    case 404:
      return 'This invitation is no longer available.';
    case 409:
      return "This invitation hasn't been sent yet.";
    default:
      return 'Could not accept the invitation. Please try again.';
  }
}
