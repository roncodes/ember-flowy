import Component from '@glimmer/component';
import { tracked } from '@glimmer/tracking';
import { action } from '@ember/object';
import { compare } from '@ember/utils';
import eachNodeAttribute from '../utils/each-node-attribute';
import eachNodeInput from '../utils/each-node-input';
import applyStylesToNode from '../utils/apply-styles-to-node';
import hasParentClass from '../utils/has-parent-class';
import createNode from '../utils/create-node';

class Flowy {};

export default class FlowyComponent extends Component {
    @tracked isLoaded = false;
    @tracked isActive = false;
    @tracked isRearranging = false;
    @tracked blocks = [];
    @tracked tempBlocks = [];
    @tracked canvasRef;
    @tracked wrapperRef;
    @tracked indicatorRef;
    @tracked dragRef;
    @tracked originalRef;
    @tracked absX = 0;
    @tracked absY = 0;
    @tracked paddingX = 0;
    @tracked paddingY = 0;
    @tracked offsetLeft = 0;
    @tracked dragX;
    @tracked dragY;
    @tracked mouseX;
    @tracked mouseY;
    @tracked dragBlock = false;
    @tracked previousBlock = 0;

    @action setupComponent(canvas) {
        this.setNodeRef('canvas', canvas);
        this.setAbsolutePosition(canvas);
        this.setArgs();
    }

    @action createContextObject() {
        const flowy = new Flowy();

        flowy.import = this.import.bind(this);
        flowy.output = this.output.bind(this);
        flowy.getHtml = this.getHtml.bind(this);

        return flowy;
    }

    @action setArgs() {
        const { paddingX, paddingY } = this.args;

        this.paddingX = paddingX ?? 0;
        this.paddingY = paddingY ?? 0;
    }

    @action setNodeRef(nodeName, node) {
        this[`${nodeName}Ref`] = node;
    }

    @action sendCallback(callbackName, ...params) {
        if (typeof this.args[callbackName] === 'function') {
            this.args[callbackName](...params);
        }
    }

    @action setAbsolutePosition(canvas) {
        const { getComputedStyle } = window;

        const position = getComputedStyle(canvas).position;
        const isAbsolute = position === 'absolute' || position === 'fixed';

        if (isAbsolute) {
            const rect = canvas.getBoundingClientRect();

            this.absX = rect?.left;
            this.absY = rect?.top;
        }
    }

    @action createBlockFromImport(block) {
        return {
            childWidth: parseFloat(block?.childWidth),
            parent: parseFloat(block?.parent),
            id: parseFloat(block?.id),
            x: parseFloat(block?.x),
            y: parseFloat(block?.y),
            width: parseFloat(block?.width),
            height: parseFloat(block?.height),
        };
    }

    @action getHtml() {
        return this.canvasRef?.innerHTML;
    }

    @action getBlocks() {
        return this.blocks ?? [];
    }

    @action import(output = {}) {
        if (compare(output, {}) === 0) {
            return;
        }

        this.canvasRef.innerHTML = output?.html;

        for (let i = 0; i < output.blocksArr.length; i++) {
            const block = output.blocksArr[i];
            const importedBlock = this.createBlockFromImport(block);

            this.blocks.pushObject(importedBlock);
        }

        if (this.blocks.length > 1) {
            this.rearange();
            this.checkOffset();
        }
    }

    @action output() {
        const html = this.getHtml();
        const blocksArr = this.getBlocks();

        const jsonData = {
            html,
            blocksArr,
            blocks: [],
        };

        if (this.blocks.length > 0) {
            for (let i = 0; i < this.blocks.length; i++) {
                const block = this.blocks[i];

                jsonData.blocks.pushObject({
                    id: block?.id,
                    parent: block?.parent,
                    data: [],
                    attr: [],
                });

                const blockParent = this.canvasRef.querySelector(`.blockid[value="${block.id}"]`)?.parentNode;

                eachNodeInput(blockParent, (input) => {
                    const name = input.getAttribute('name');
                    const value = input.getAttribute('value');

                    jsonData.blocks[i].data.pushObject({
                        name,
                        value,
                    });
                });

                eachNodeAttribute(blockParent, (attribute) => {
                    const json = {};

                    json[attribute.name] = attribute.value;
                    jsonData.blocks[i].attr.pushObject(json);
                });
            }
        }

        return jsonData;
    }

    @action clearCanvas() {
        this.blocks.clear();
    }

    @action beginDrag(event) {
        const { targetTouches, which, target, changedTouches, mouseX, mouseY } = event;

        this.setAbsolutePosition();

        if (targetTouches) {
            this.mouseX = changedTouches[0]?.clientX;
            this.mouseY = changedTouches[0]?.clientY;
        } else {
            this.mouseX = clientX;
            this.mouseY = clientY;
        }

        if (which !== 3 && target.closest('.create-flowy')) {
            this.originalRef = originalNode = target.closest('.create-flowy');

            const clonedNode = originalNode.cloneNode(true);
            const originalNodeRect = originalNode.getBoundingClientRect();

            originalNode.classList.add('drag-now');

            cloneNode.classList.add('block');
            cloneNode.classList.remove('create-flowy');

            const blockId =
                this.blocks.length === 0
                    ? this.blocks.length
                    : Math.max.apply(
                          Math,
                          this.blocks.map((b) => b.id)
                      ) + 1;

            cloneNode.innerHTML = `<input type="hidden" name="blockId" class="blockId" value="${blockId}" />`;
            this.wrapperRef.appendChild(cloneNode);
            this.dragRef = this.wrapperRef.querySelector(`.blockId[value="${blockId}"]`)?.parentNode;

            this.sendCallback('onBlockGrabbed', originalNode);

            this.dragRef.classList.add('dragging');
            this.isActive = true;
            this.dragX = this.mouseX = originalNodeRect?.left;
            this.dragY = this.mouseY = originalNodeRect?.top;

            applyStylesToNode(this.dragRef, {
                left: this.mouseX - this.dragX + 'px',
                top: this.mouseY - this.dragY + 'px',
            });
        }
    }

    @action endDrag(event) {
        const { targetTouches, which, target, changedTouches, mouseX, mouseY } = event;
        const isReleased = which !== 3 && (this.isActive || this.isRearranging);

        if (isReleased) {
            this.dragBlock = false;
            this.sendCallback('onBlockReleased');

            if (!this.indicatorRef.classList.contains('invisible')) {
                this.indicatorRef.classList.add('invisible');
            }

            if (this.isActive) {
                this.originalRef.classList.remove('drag-now');
                this.dragRef.classList.remove('dragging');
            }

            const dragRect = this.dragRef.getBoundingClientRect();
            const canvasRect = this.canvasRef.getBoundingClientRect();

            const isRearrangingBlock = parseInt(this.dragRef.querySelector('.blockId').value === 0 && this.isRearranging);
            const isDroppingBlock =
                this.isActive &&
                this.blocks.length === 0 &&
                dragRect.top + window.scrollY > canvasRect.top + window.scrollY &&
                dragRect.left + window.scrollX > canvasRect.left + window.scrollX;
            const isRemovingBlock = this.isActive && this.blocks.length === 0;

            if (isRearrangingBlock) {
                this.createFirstBlock('rearrange');
            } else if (isDroppingBlock) {
                this.createFirstBlock('drop');
            } else if (isRemovingBlock) {
                this.removeSelection();
            } else if (this.isActive) {
                const ids = this.blocks.map((b) => b.id);

                for (let i = 0; i < this.blocks.length; i++) {
                    const block = this.blocks.objectAt(i);
                    const blockNode = this.wrapperRef.querySelector(`.blockId[value="${block.id}"]`);
                    const blockNodeParent = blockNode?.parentNode;
                    const isLastBlock = i === this.blocks.length - 1;

                    if (this.checkAttach(block.id)) {
                        this.isActive = false;

                        if (this.blockSnap(false, blockNodeParent)) {
                            this.snap(i, ids);
                        } else {
                            this.isActive = false;
                            this.removeSelection();
                        }
                        break;
                    } else if (isLastBlock) {
                        this.isActive = false;
                        this.removeSelection();
                    }
                }
            } else if (this.isRearranging) {
                const ids = this.blocks.map((b) => b.id);

                for (let i = 0; i < this.blocks.length; i++) {
                    const block = this.blocks.objectAt(i);
                    const blockNode = this.wrapperRef.querySelector(`.blockId[value="${block.id}"]`);
                    const blockNodeParent = blockNode?.parentNode;
                    const isLastBlock = i === this.blocks.length - 1;

                    if (this.checkAttach(block.id)) {
                        this.isActive = false;
                        this.dragRef.classList.remove('dragging');
                        this.snap(i, ids);
                        break;
                    } else if (isLastBlock) {
                        if (beforeDelete(block)) {
                            this.isActive = false;
                            this.dragRef.classList.remove('dragging');
                            this.snap(ids.indexOf(this.previousBlock), ids);
                            break;
                        } else {
                            this.isRearranging = false;
                            this.tempBlocks = [];
                            this.isActive = false;
                            this.removeSelection();
                            break;
                        }
                    }
                }
            }
        }
    }

    @action checkAttach(id) {
        const { getComputedStyle } = window;

        const dragRect = this.dragRef.getBoundingClientRect();
        const canvasRect = this.canvasRef.getBoundingClientRect();
        const computedStyle = getComputedStyle(this.dragRef);

        const xPos = dragRect.left + window.scrollX + parseInt(computedStyle.width) / 2 + this.canvasRef.scrollLeft - canvasRect.left;
        const yPos = dragRect.top + window.scrollY + this.canvasRef.scrollTop - canvasRect.top;
        const isAttached =
            xPos >= this.blocks.filter((a) => a.id == id)[0].x - this.blocks.filter((a) => a.id == id)[0].width / 2 - this.paddingX &&
            xPos <= this.blocks.filter((a) => a.id == id)[0].x + this.blocks.filter((a) => a.id == id)[0].width / 2 + this.paddingX &&
            yPos >= this.blocks.filter((a) => a.id == id)[0].y - this.blocks.filter((a) => a.id == id)[0].height / 2 &&
            yPos <= this.blocks.filter((a) => a.id == id)[0].y + this.blocks.filter((a) => a.id == id)[0].height;

        if (isAttached) {
            return true;
        } else {
            return false;
        }
    }

    @action removeSelection() {
        this.canvasRef.appendChild(this.indicatorRef);
        this.dragRef.parentNode.removeChild(this.dragRef);
    }

    @action createFirstBlock(type) {
        const { getComputedStyle } = window;

        const dragRect = this.dragRef.getBoundingClientRect();
        const canvasRect = this.canvasRef.getBoundingClientRect();
        const computedStyle = getComputedStyle(this.dragRef);
        const blockId = parseInt(this.dragRef.querySelector('.blockId')?.value ?? 0);

        switch (type) {
            case 'rearrange':
                this.dragRef.classList.remove('dragging');
                this.isRearranging = false;

                for (let i = 0; i < this.tempBlocks.length; i++) {
                    const tempBlock = this.tempBlocks.objectAt(i);
                    const tempBlockNode = this.wrapperRef.querySelector(`.blockId[value="${tempBlock.id}"]`);
                    const tempBlockArrowNode = this.wrapperRef.querySelector(`.arrowId[value="${tempBlock.id}"]`);

                    if (tempBlock.id !== blockId) {
                        const blockParent = tempBlockNode.parentNode;
                        const arrowParent = tempBlockArrowNode.parentNode;
                        const blockParentRect = blockParent.getBoundingClientRect();
                        const arrowParentRect = arrowParent.getBoundingClientRect();

                        applyStylesToNode(blockParent, {
                            left: blockParentRect.left + window.scrollX - window.scrollX + this.canvasRef.scrollLeft - 1 - this.absX + 'px',
                            top: blockParentRect.top + window.scrollY - window.scrollY + this.canvasRef.scrollTop - this.absY - 1 + 'px',
                        });

                        applyStylesToNode(arrowParent, {
                            left: arrowParentRect.left + window.scrollX - window.scrollX + this.canvasRef.scrollLeft - this.absX - 1 + 'px',
                            top: arrowParentRect.top + window.scrollY + this.canvasRef.scrollTop - 1 - this.absY + 'px',
                        });

                        this.canvasRef.appendChild(blockParent);
                        this.canvasRef.appendChild(arrowParent);

                        this.tempBlocks[i].x = blockParentRect.left + window.scrollX) + (parseInt(blockParent.offsetWidth) / 2) + this.canvasRef.scrollLeft - canvasRect.left - 1;
                        this.tempBlocks[i].y = (blockParentRect.top + window.scrollY) + (parseInt(blockParent.offsetHeight) / 2) + this.canvasRef.scrollTop - canvasRect.top - 1;
                    }
                }

                this.tempBlocks.filter(tempBlock => tempBlock.id === 0)[0].x = (dragRect.left + window.scrollX) + (parseInt(computedStyle.width) / 2) + this.canvasRef.scrollLeft - canvasRect.left;
                this.tempBlocks.filter(tempBlock => tempBlock.id === 0)[0].y = (dragRect.top + window.scrollY) + (parseInt(computedStyle.height) / 2) + this.canvasRef.scrollTop - canvasRect.top;
                this.blocks = this.blocks.concat(this.tempBlocks);
                this.tempBlocks = [];
            case 'drop':
            default:
                this.blockSnap(true, undefined);
                this.isActive = false;

                applyStylesToNode(this.dragRef, {
                    top: (dragRect.top + window.scrollY) - (this.absY + window.scrollY) + this.canvasRef.scrollTop + 'px',
                    left: (dragRect.left + window.scrollX) - (this.absX + window.scrollX) + this.canvasRef.scrollLeft + 'px'
                });

                this.canvasRef.appendChild(this.dragRef);
                this.blocks.pushObject({
                    parent: -1,
                    childWidth: 0,
                    id: blockId,
                    x: (dragRect.left + window.scrollX) + (computedStyle.width) / 2) + this.canvasRef.scrollLeft - canvasRect.left,
                    y: (dragRect.top + window.scrollY) + (parseInt(computedStyle.height) / 2) + this.canvasRef.scrollTop - canvasRect.top,
                    width: parseInt(computedStyle.width),
                    height: parseInt(computedStyle.height)
                });
                break;
        }
    }

    @action drawArrow(arrow, x, y, id) {
        const blockId = parseInt(this.dragRef.querySelector(`.blockId`).value ?? 0);
        const canvasRect = this.canvasRef.getBoundingClientRect();
        const arrowNode = this.applyArrowNodeToCanvas(blockId, x, y);

        if (x < 0) {
            applyStylesToNode(arrowNode.parentNode, {
                left: (arrow.x - 5) - (this.absX + window.scrollX) + this.canvasRef.scrollLeft + canvasRect.left + 'px'
            });
        } else {
            applyStylesToNode(arrowNode.parentNode, {
                left: this.blocks.filter(b => b.id == id)[0].x - 20 - (this.absX + window.scrollX) + this.canvasRef.scrollLeft + canvasRect.left + 'px'
            });
        }

        applyStylesToNode(arrowNode.parentNode, {
            top: this.blocks.filter(b => b.id == id)[0].y + (this.blocks.filter(b => b.id == id)[0].height / 2) + canvasRect.top - this.absY + 'px'
        });
    }

    @action updateArrow(arrow, x, y, children) {
        const arrowNode = this.wrapperRef.querySelector(`.arrowId[value="${children.id}"]`)?.parentNode;
        const canvasRect = this.canvasRef.getBoundingClientRect();
        const arrowIdNode = createNode('input', { type: 'hidden', class: 'arrowId', value: children.id });
        const svgPaths = [];

        if (x < 0) {
            applyStylesToNode(arrowNode, {
                left: (arrow.x - 5) - (this.absX + window.scrollX) + canvasRect.left + 'px'
            });
            svgPaths.pushObject(createNode('path', {
                d: `M${(this.blocks.filter(b => b.id == children.parent)[0].x - arrow.x + 5)} 0L${(this.blocks.filter(b => b.id == children.parent)[0].x - arrow.x + 5)} ${(this.paddingY / 2)}L5 ${(this.paddingY / 2)}L5 ${y}`,
                stroke: '#C5CCD0',
                strokeWidth: '2px'
            }));
            svgPaths.pushObject(createNode('path', {
                d: `M0 ${(y - 5)}H10L5 ${y}L0 ${(y - 5)}Z`,
                fill: '#C5CCD0'
            }));
        } else {
            applyStylesToNode(arrowNode, {
                left: this.blocks.filter(b => b.id == children.parent)[0].x - 20 - (this.absX + window.scrollX) + canvasRect.left + 'px'
            });
            svgPaths.pushObject(createNode('path', {
                d: `M20 0L20 ${(this.paddingY / 2)}L${(x)} ${(this.paddingY / 2)}L${x} ${y}`,
                stroke: '#C5CCD0',
                strokeWidth: '2px'
            }));
            svgPaths.pushObject(createNode('path', {
                d: `M${(x - 5)} ${(y - 5)}H${(x + 5)}L${x} ${y}L${(x - 5)} ${(y - 5)}Z`,
                fill: '#C5CCD0'
            }));
        }

        const svgNode = createNode('svg', {
            preserveaspectratio: 'none',
            fill: 'none',
            xmlns: 'http://www.w3.org/2000/svg',
        }, {}, svgPaths);

        arrowNode.innerHTML = svgNode.innerHTML;
    }

    @action applyArrowNodeToCanvas(blockId, x, y) {
        const arrowNode = this.createArrowNode(blockId, x, y);

        this.canvasRef.innerHTML = arrowNode.innerHTML;

        const appliedArrowNode = this.canvasRef.querySelector(`.arrowId[value="${blockId}"]`);
        return appliedArrowNode;
    }

    @action createArrowNode(blockId, x, y) {
        const wrapperNode = createNode('div', { class: 'arrow-block'});
        const arrowIdNode = createNode('input', { type: 'hidden', class: 'arrowId', value: blockId });
        const svgNode = createNode('svg', {
            preserveaspectratio: 'none',
            fill: 'none',
            xmlns: 'http://www.w3.org/2000/svg',
        });
        const svgPaths = [];

        if (x < 0) {
            svgPaths.pushObject(createNode('path', {
                d: `M${this.blocks.filter(a => a.id == id)[0].x - arrow.x + 5)} 0L${this.blocks.filter(a => a.id == id)[0].x - arrow.x + 5)} ${(this.paddingY / 2)}L5${(this.paddingY / 2)}L5 ${y}`
                stroke: '#C5CCD0',
                strokeWidth: '2px'
            }));

            svgPaths.pushObject(createNode('path', {
                d: `M0 ${(y - 5)} H10L5${y}L0 ${(y-5)}Z`
                fill: '#C5CCD0'
            }));
        } else {
            svgPaths.pushObject(createNode('path', {
                d: `M20 0L20 ${(this.paddingY / 2)}L${x} ${(paddingy / 2)}L${x} ${y}`,
                stroke: '#C5CCD0',
                strokeWidth: '2px'
            }));

            svgPaths.pushObject(createNode('path', {
                d: `M${(x - 5)} ${(y - 5)}H${(x + 5)}L${x} ${y}L${(x - 5)} ${(y - 5)}Z`,
                fill: '#C5CCD0'
            }));
        }

        for (let i = 0; i < svgPaths.length; i++) {
            const path = svgPaths.objectAt(i);
            svgNode.appendChild(path);
        }

        wrapperNode.appendChild(arrowIdNode);
        wrapperNode.appendChild(svgNode);

        return wrapperNode;
    }

    @action snap(i, ids) {
        if (!this.isRearranging) {
            this.canvasRef.appendChild(this.dragRef);
        }

        const { getComputedStyle } = window;

        const dragRect = this.dragRef.getBoundingClientRect();
        const canvasRect = this.canvasRef.getBoundingClientRect();
        const computedStyle = getComputedStyle(this.dragRef);
        const blockId = parseInt(this.dragRef.querySelector(`.blockId`).value ?? 0);
        const totalWidth = 0;
        const totalRemove = 0;
        const maxHeight = 0;
        const children = this.blocks.filter(block => block.parent === ids[i]);

        for (let j = 0; j < children.length; j++) {
            const child = children.objectAt(j);

            if (child.childWidth > child.width) {
                totalWidth += child.childWidth + this.paddingX;
            } else {
                totalWidth += child.width + this.paddingX;
            }
        }

        totalWidth += parseInt(computedStyle.width);

        for (let j = 0; j < children.length; j++) {
            const child = children.objectAt(j);
            const childNodeParent = this.wrapperRef.querySelector(`.blockId[value="${children.id}"]`).parentNode;

            if (child.childWidth > child.width) {
                applyStylesToNode(childNodeParent, {
                    left: this.blocks.filter(b => b.id == =ids[i])[0].x - (totalWidth / 2) + totalRemove + (child.childWidth / 2) - (child.width / 2) + 'px'
                });

                child.x = this.blocks.filter(b => b.parent === ids[i])[0].x - (totalWidth / 2) + totalRemove + (child.childWidth / 2);
                totalRemove += child.childWidth + this.paddingX;
            } else {
                applyStylesToNode(childNodeParent, {
                    left: this.blocks.filter(b => b.id == ids[i])[0].x - (totalWidth / 2) + totalRemove + 'px'
                });
                
                child.x = this.blocks.filter(b => b.parent == ids[i])[0].x - (totalWidth / 2) + totalRemove + (child.width / 2);
                totalRemove += child.childWidth + this.paddingX;
            }
        }

        applyStylesToNode(this.dragRef, {
            left: this.blocks.filter(b => b.id == ids[i])[0].x - (totalWidth / 2) + totalRemove - (window.scrollX + this.absX) + this.canvasRef.scrollLeft + canvasRect.left + 'px',
            top: this.blocks.filter(b => b.id == ids[i])[0].y + (this.blocks.filter(b => b.id == ids[i])[0].height / 2) + this.paddingY - (window.scrollY + this.absY) + canvasRect.top + 'px'
        });

        if (this.isRearranging) {
            const currentTempBlock = this.tempBlocks.find(tempBlock => tempBlock.id === blockId);

            currentTempBlock.x = (dragRect.left + window.scrollX) + (parseInt(computedStyle.width) / 2) + this.canvasRef.scrollLeft - canvasRect.left;
            currentTempBlock.y = (dragRect.top + window.scrollY) + (parseInt(computedStyle.height) / 2) + this.canvasRef.scrollTop - canvasRect.top;
            currentTempBlock.parent = ids[i];

            for (let j = 0; j < this.tempBlocks.length; j++) {
                const tempBlock = this.tempBlocks[j];
                const tempBlockNode = this.wrapperRef.querySelector(`.blockId[value="${tempBlock.id}"]`);
                const tempBlockArrowNode = this.wrapperRef.querySelector(`.arrowId[value="${tempBlock.id}"]`);

                if (tempBlock.id !== blockId) {
                    const blockParent = tempBlockNode.parentNode;
                    const arrowParent = tempBlockArrowNode.parentNode;
                    const blockParentRect = blockParent.getBoundingClientRect();
                    const arrowParentRect = arrowParent.getBoundingClientRect();
                    const blockParentComputedStyle = getComputedStyle(blockParent);

                    applyStylesToNode(blockParent, {
                        left: (blockParentRect.left + window.scrollX) - (window.scrollX + canvasRect.left) + this.canvasRef.scrollLeft + 'px',
                        top: (blockParentRect.top + window.scrollY) - (window.scrollY + canvasRect.top) + this.canvasRef.scrollTop + 'px',
                    });

                    applyStylesToNode(arrowParent, {
                        left: (arrowParentRect.left + window.scrollX) - (window.scrollX + canvasRect.left) + this.canvasRef.scrollLeft + 20 + 'px',
                        top: (arrowParentRect.top + window.scrollY) - (window.scrollY + cancasRect.top) + this.canvasRef.scrollTop + 'px',
                    });

                    this.canvasRef.appendChild(blockParent);
                    this.canvasRef.appendChild(arrowParent);

                    this.tempBlocks[i].x = (blockParentRect.left + window.scrollX) + (parseInt(blockParentComputedStyle.width) / 2) + this.canvasRef.scrollLeft - canvasRect.left;
                    this.tempBlocks[i].y = (blockParentRect.top + window.scrollY) + (parseInt(blockParentComputedStyle.height) / 2) + this.canvasRef.scrollTop - canvasRect.top;
                }
            }

            this.blocks = this.blocks.concat(this.tempBlocks);
            this.tempBlocks = [];
        } else {
            this.blocks.pushObject({
                childWidth: 0,
                parent: IDS[i],
                id: blockId,
                x: (dragRect.left + window.scrollX) + (parseInt(computedStyle.width) / 2) + this.canvasRef.scrollLeft - canvasRect.left,
                y: (dragRect.top + window.scrollY) + (parseInt(computedStyle.height) / 2) + this.canvasRef.scrollTop - canvasRect.top,
                width: parseInt(computedStyle.width),
                height: parseInt(computedStyle.height)
            });
        }

        const arrowBlock = this.blocks.find(block => block.id === blockId);
        const currentBlock = this.blocks.find(block => block.id === ids[i]);
        const arrowX = arrowBlock.x - currentBlock.x + 20;
        const arrowY = this.paddingY;

        this.drawArrow(arrowBlock, arrowX, arrowY, ids[i]);
        
        if (currentBlock.parent !== -1) {
            let flag = false;
            let idVal = ids[i];

            while (!flag) {
                if (currentBlock.parent === -1) {
                    flag = true;
                } else {
                    const zWidth = 0;

                    for (let j = 0; j < children.length; j++) {
                        const child = children.objectAt(j);
                        const isLastChild = j === children.length - 1;
                        const isChildWidthBigger = child.childWidth > child.width;

                        if (isLastChild) {
                            zWidth += isChildWidthBigger ? child.childWidth : child.width;
                        } else {
                            zWidth += isChildWidthBigger ? child.childWidth + this.paddingX : child.width + this.paddingX;;
                        }
                    }

                    currentBlock.childwidth = zWidth;
                    idVal = currentBlock.parent;
                }
            }

            const currentBlockParent = this.blocks.find(block => block.id === idVal);
            currentBlockParent.childwidth = totalwidth;
        }

        if (this.isRearranging) {
            this.isRearranging = false;
            this.dragRef.classList.remove('dragging');
        }

        this.rearange();
        this.checkOffset();
    }

    @action touchBlock(event) {
        const { target, targetTouches, clientX, clientY, type } = event;
        const dragRect = this.dragRef.getBoundingClientRect();

        this.dragBlock = false;

        if (hasParentClass(target, 'block')) {
            const block = target.closest('.block');

            if (targetTouches) {
                this.mouseX = targetTouches[0].clientX;
                this.mouseY = targetTouches[0].clientY;
            } else {
                this.mouseX = clientX;
                this.mouseY = clientY;
            }

            if ((type !== 'mouseup' && hasParentClass(target, 'block')) && event.which !== 3 && (!this.isActive && !this.isRearranging)) {
                this.dragBlock = true;
                this.drag = block;
                this.dragX = this.mouseX - (dragRect.left + window.scrollX);
                this.dragY = this.mouseY - (dragRect.top + window.scrollY);
            }
        }
    }

    @action moveBlock(event) {
        const { target, targetTouches, clientX, clientY, type } = event;
        const { getComputedStyle } = window;

        const dragRect = this.dragRef.getBoundingClientRect();
        const canvasRect = this.canvasRef.getBoundingClientRect();
        const computedStyle = getComputedStyle(this.dragRef);

        if (targetTouches) {
            this.mouseX = targetTouches[0].clientX;
            this.mouseY = targetTouches[0].clientY;
        } else {
            this.mouseX = event.clientX;
            this.mouseY = event.clientY;
        }

        if (this.dragBlock) {
            this.isRearranging = true;
            this.dragRef.classList.add('dragging');

            const blockId = parseInt(this.dragRef.querySelector(`.blockId`).value ?? 0);
            const previousBlock = this.blocks.find(block => block.id == blockId);

            this.previousBlock = previousBlock?.parent;
            this.tempBlocks.push(previousBlock);

            this.blocks = this.blocks.filter(block => block.id !== blockId);

            if (blockId !== 0) {
                this.wrapperRef.querySelector(`.arrowId[value="${blockId}"]`)?.parentNode?.remove();
            }

            const layers = this.blocks.filter(block => block.parent == blockId);
            const flag = false;
            const discoveredIds = [];
            const allIds = [];

            while (!flag) {
                for (let i = 0; i < layers.length; i++) {
                    const layer = layers.objectAt(i);

                    if (layer !== blockId) {
                        this.tempBlocks.pushObject(layer);

                        const blockParent = this.wrapperRef.querySelector(`.blockId[value="${layer.id}"]`).parentNode;
                        const arrowParent = this.wrapperRef.querySelector(`.arrowId[value="${layer.id}"]`).parentNode;
                        const blockParentRect = blockParent.getBoundingClientRect();
                        const arrowParentRect = arrowParent.getBoundingClientRect();

                        applyStylesToNode(blockParent, {
                            left: (blockParentRect.left + window.scrollX) - (dragRect.left + window.scrollX) + 'px',
                            top: (blockParentRect.top + window.scrollY) - (dragRect.top + window.scrollY) + 'px'
                        });

                        applyStylesToNode(arrowParent, {
                            left: (arrowParentRect.left + window.scrollX) - (dragRect.left + window.scrollX) + 'px',
                            top: (arrowParentRect.top + window.scrollY) - (dragRect.top + window.scrollY) + 'px'
                        });

                        this.dragRef.appendChild(blockParent);
                        this.dragRef.appendChild(arrowParent);

                        discoveredIds.push(layer.id);
                        allIds.push(layer.id);
                    }
                }

                if (discoveredIds.length == 0) {
                    flag = true;
                } else {
                    layer = this.blocks.filter(block => discoveredIds.includes(block.parent));
                    discoveredIds = [];
                }
            }

            for (let i = 0; i < layers.length; i++) {
                const layer = layers[i];
                
                this.blocks = this.blocks.filter(block => block.id !== layer);
            }

            for (let i = 0; i < allIds.length; i++) {
                const id = allIds[i];

                this.blocks = this.blocks.filter(block => block.id !== id);
            }

            if (this.blocks.length > 1) {
                this.rearange();
            }

            this.dragBlock = false;
        }

        if (this.isActive) {
            applyStylesToNode(this.dragRef, {
                left: this.mouseX - this.dragX + 'px',
                top: this.mouseY - this.dragY + 'px'
            });
        } else if (this.isRearranging) {
            applyStylesToNode(this.dragRef, {
                left: this.mouseX - this.dragX - (window.scrollX + this.absX) + this.canvasRef.scrollLeft + 'px',
                top: this.mouseY - this.dragY - (window.scrollY + this.absY) + this.canvasRef.scrollTop + 'px'
            });

            const tempBlock = this.tempBlocks.find(block => block.id === blockId);

            tempBlock.x = (dragRect.left + window.scrollX) + (parseInt(computedStyle.width) / 2) + this.canvasRef.scrollLeft;
            tempBlock.y = (dragRect.top + window.scrollY) + (parseInt(computedStyle.height) / 2) + this.canvasRef.scrollTop;
        }

        if (this.isActive || this.isRearranging) {
            if (this.mouseX > canvasRect.width + canvasRect.left - 10 && this.mouseX < canvasRect.width + canvasRect.left + 10) {
                this.canvasRef.scrollLeft += 10;
            } else if (this.mouseX < canvasRect.left + 10 && this.mouseX > canvasRect.left - 10) {
                this.canvasRef.scrollLeft -= 10;
            } else if (this.mouseY > canvasRect.height + canvasRect.top - 10 && this.mouseY < canvasRect.height + canvasRect.top + 10) {
                this.canvasRef.scrollTop += 10;
            } else if (this.mouseY < canvasRect.top + 10 && this.mouseY > canvasRect.top - 10) {
                this.canvasRef.scrollLeft -= 10;
            }

            const xPos = (dragRect.left + window.scrollX) + (parseInt(computedStyle.width) / 2) + this.canvasRef.scrollLeft - canvasRect.left;
            const yPos = (dragRect.top + window.scrollY) + this.canvasRef.scrollTop - canvasRect.top;
            const ids = this.blocks.map(block => block.id);

            for (var i = 0; i < this.blocks.length; i++) {
                const block = this.blocks[i];
                const blockNode = this.wrapperRef.querySelector(`.blockId[value="${block.id}"]`);
                const blockNodeParent = blockNode?.parentNode;
                const indicatorNode = this.wrapperRef.querySelector('.indicator');
                const isLastBlock = i === this.blocks.length - 1;

                if (this.checkAttach(block.id)) {
                    blockNodeParent.appendChild(indicatorNode);

                    applyStylesToNode(indicatorNode, {
                        left: blockNodeParent.offsetWidth / 2) - 5 + 'px',
                        top: blockNodeParent.offsetHeight + 'px'
                    });

                    indicatorNode.classList.remove('invisible');
                    break;

                } else if (isLastBlock) {
                    if (!indicatorNode.classList.contains('invisible')) {
                        indicatorNode.classList.add('invisible');
                    }
                }
            }
        }
    }

    @action checkOffset() {
        const { getComputedStyle } = window;

        const dragRect = this.dragRef.getBoundingClientRect();
        const canvasRect = this.canvasRef.getBoundingClientRect();
        const computedStyle = getComputedStyle(this.dragRef);

        this.offsetLeft = this.blocks.map(block => block.x);

        const widths = this.blocks.map(block => block.width);
        const ids = this.blocks.map(block => block.id);
        const mathMin = this.offsetLeft.map((item, index) => item - (widths[index] / 2));

        this.offsetLeft = Math.min.apply(Math, mathMin);

        if (this.offsetLeft < (canvasRect.left + window.scrollX - this.absX)) {
            for (let i = 0; i < this.blocks.length; i++) {
                const block = this.blocks.objectAt(i);
                const blockNode = this.wrapperRef.querySelector(`.blockId[value="${block.id}"]`);
                const arrowNode = this.wrapperRef.querySelector(`.arrowId[value="${block.id}"]`);
                const blockNodeParent = blockNode?.parentNode;

                applyStylesToNode(blockNodeParent, {
                    left: block.x - (block.width / 2) - this.offsetLeft + canvasRect.left - this.absX + 20 + 'px'
                });

                if (block.parent !== -1) {
                    const blockParent = this.blocks.find(b => b.id == block.parent);
                    const arrowX = block.x - blockParent?.x;

                    if (arrowX < 0) {
                        applyStylesToNode(arrowNode.parentNode, {
                            left: (block.x - this.offsetLeft + 20 - 5) + canvasRect.left - this.absX + 'px'
                        });
                    } else {
                        applyStylesToNode(arrowNode.parentNode, {
                            left: blockParent.x - 20 - this.offsetLeft + canvasRect.left - this.absX + 20 + 'px'
                        });
                    }
                }
            }

            for (var i = 0; i < this.blocks.length; i++) {
                const block = this.blocks.objectAt(i);
                const blockNode = this.wrapperRef.querySelector(`.blockId[value="${block.id}"]`);
                const blockNodeParent = blockNode?.parentNode;
                const blockNodeParentRect = blockNodeParent.getBoundingClientRect();
                const blockNodeParentComputedStyle = getComputedStyle(blockNodeParent);

                this.blocks[i].x = (blockNodeParentRect.left + window.scrollX) + (this.canvasRef.scrollLeft) + (parseInt(blockNodeParentComputedStyle.width) / 2) - 20 - canvasRect.left;
            }
        }
    }

    @action rearange() {
        const { getComputedStyle } = window;

        const dragRect = this.dragRef.getBoundingClientRect();
        const canvasRect = this.canvasRef.getBoundingClientRect();
        const computedStyle = getComputedStyle(this.dragRef);
        const results = this.blocks.map(block => block.parent);

        for (let i = 0; i < results.length; i++) {
            if (result === -1) {
                i++;
            }

            const result = results.objectAt(i);
            const block = this.blocks.find(b => b.id === result);
            const totalWidth = 0;
            const totalRemove = 0;
            const maxHeight = 0;
            const children = this.blocks.filter(b => b.parent === result);

            for (let j = 0; j < children.length; j++) {
                const child = children.objectAt(j);
                const matching = this.blocks.filter(b => b.id === child.id);
                const isLast = j === children.length - 1;
                const isChildWidthBigger = child.childWidth > child.width;
                
                if (matching.length === 0) {
                    child.childWidth = 0;
                }

                if (isLast) {
                    totalWidth += isChildWidthBigger ? child.childWidth : child.width;
                } else {
                    totalWidth += isChildWidthBigger ? child.childWidth + this.paddingX : child.width + this.paddingX;
                }
            }

            if (result !== -1) {
                block.childWidth = totalWidth;
            }

            for (let j = 0; j < children.length; j++) {
                const child = children.objectAt(j);
                const blockNode = this.wrapperRef.querySelector(`.blockId[value="${block.id}"]`);
                const blockNodeParent = blockNode?.parentNode;
                const blockNodeParentRect = blockNodeParent.getBoundingClientRect();
                const blockNodeParentComputedStyle = getComputedStyle(blockNodeParent);
                const matching = this.blocks.filter(b => b.id === result);
                const firstMatching = matching[0] ?? {};

                applyStylesToNode(blockNodeParent, {
                    top: firstMatching.y + this.paddingY + canvasRect.top - this.absY + 'px'
                });

                firstMatching.y = firstMatching.y + this.paddingY;

                if (child.childWidth > child.width) {
                    applyStylesToNode(blockNodeParent, {
                        left: firstMatching.x - (totalWidth / 2) + totalRemove + (child.childWidth / 2) - (child.width / 2) - (this.absX + window.scrollX) + canvasRect.left + "px"
                    });

                    child.x = firstMatching.x - (totalWidth / 2) + totalRemove + (child.childWidth / 2);
                    totalRemove += child.childWidth + this.paddingX;
                } else {
                    applyStylesToNode(blockNodeParent, {
                        left: firstMatching.x - (totalWidth / 2) + totalRemove - (this.absX + window.scrollX) + canvasRect.left + "px"
                    });

                    child.x = firstMatching.x - (totalWidth / 2) + totalRemove + (child.width / 2);
                    totalRemove += child.width + this.paddingX;
                }

                const arrowBlock = this.blocks.find(b => b.id === child.id);
                const arrowBlockParent = this.blocks.find(b => b.id === child.parent);
                const arrowX = arrowBlock.x - arrowBlockParent.x + 20;
                const arrowY = this.paddingY;

                this.updateArrow(arrowBlock, arrowX, arrowY, child);
            }
        }
    }

    @action blockGrabbed(block) {
        return this.sendCallback('onGrab', block);
    }

    @action blockReleased() {
        return this.sendCallback('onRelease');
    }

    @action blockSnap(first, parentNode) {
        return this.sendCallback('onSnapping', this.dragRef, first, parentNode);
    }

    @action beforeDelete(parentNode) {
        return this.sendCallback('onRearrange', this.dragRef, parentNode);
    }
}
