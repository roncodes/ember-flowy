export default function eachNodeInput(node, input) {
  return node?.querySelectorAll('input').forEach(callback);
}
