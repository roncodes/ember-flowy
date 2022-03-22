export default function eachNodeAttribute(node, callback = null) {
  return Array.prototype.slice.call(node?.attributes).forEach(callback);
}
