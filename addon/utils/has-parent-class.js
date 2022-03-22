const _hasParentClass = (element, className) => {
    if (element?.className && element.className.split(' ').indexOf(className) >= 0) {
        return true;
    }
    
    return element.parentNode && _hasParentClass(element.parentNode, className);
};

export default function hasParentClass(element, className) {
    return _hasParentClass(element, className);
}
