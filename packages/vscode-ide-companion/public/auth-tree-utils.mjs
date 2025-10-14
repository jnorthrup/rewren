// Shared UI utilities for auth tree components
export class AuthTreeUtils {
  /**
   * Truncates text with a middle ellipsis, preserving the start and end.
   * Mirrors the behaviour used by the provider tree so breadcrumbs and
   * tree labels remain visually consistent.
   * @param {string} text
   * @param {number} maxLen
   * @returns {string}
   */
  static truncateMiddle(text = '', maxLen = 32) {
    if (!text || text.length <= maxLen) {
      return text;
    }
    if (maxLen <= 1) {
      return '…';
    }
    const keep = Math.floor((maxLen - 1) / 2);
    return `${text.slice(0, keep)}…${text.slice(-keep)}`;
  }

  /**
   * Builds a breadcrumb string for the current selection. The breadcrumb
   * always begins with "Providers" and then appends the truncated label for
   * the selected item (provider, quota node, etc.).
   * @param {object|null} item
   * @returns {string}
   */
  static buildBreadcrumbPath(item) {
    const root = 'Providers';
    if (!item) {
      return root;
    }

    const label = this.truncateMiddle(this.labelForItem(item), 28);
    if (!label) {
      return root;
    }
    return `${root} › ${label}`;
  }

  /**
   * Produces a human readable label for a list item.
   * @param {object} item
   * @returns {string}
   */
  static labelForItem(item) {
    if (!item) {
      return '';
    }
    if (item.label) {
      return item.label;
    }
    if (item.type === 'provider') {
      return item.data?.provider || item.provider || '';
    }
    if (item.type === 'model') {
      return item.data?.model || item.title || '';
    }
    return item.title || item.name || '';
  }
}

export default AuthTreeUtils;
