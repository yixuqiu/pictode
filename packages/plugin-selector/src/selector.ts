import { App, EventArgs, Konva, KonvaNode, util } from '@pictode/core';

import { HightLightConfig, Options, TransformerConfig } from './types';

interface HightLightRect {
  rect: Konva.Rect;
  transformHandler: (...args: any) => any;
}

export class Selector {
  public app: App;
  public selected: Map<number | string, KonvaNode>;
  public optionLayer: Konva.Layer;
  public enabled: boolean;
  public multipleSelect: boolean;
  public hightLightConfig: HightLightConfig;
  public transformerConfig: TransformerConfig;

  private transformer: Konva.Transformer;
  private rubberRect: Konva.Rect;
  private rubberStartPoint: util.Point = new util.Point(0, 0);
  private rubberEnable: boolean = false;
  private hightLightRects: Map<string, HightLightRect>;

  constructor(app: App, options: Options) {
    const { enabled, multipleSelect, transformer, hightLight } = options;
    this.app = app;
    this.selected = new Map();
    this.hightLightRects = new Map();
    this.enabled = enabled;
    this.multipleSelect = multipleSelect;
    this.transformerConfig = transformer;
    this.hightLightConfig = hightLight;

    this.optionLayer = new Konva.Layer();
    this.optionLayer.name('pictode:option:layer');
    this.app.stage.add(this.optionLayer);

    this.transformer = new Konva.Transformer({
      ...this.transformerConfig,
      shouldOverdrawWholeArea: false, // 空白区域是否支持鼠标事件
      flipEnabled: false,
    });
    this.transformer.anchorStyleFunc((anchor) => {
      if (
        ['middle-left', 'middle-right', 'top-center', 'bottom-center'].some((anchorName) =>
          anchor.hasName(anchorName)
        ) &&
        ([...this.selected.values()]?.[0] instanceof Konva.Text ||
          [...this.selected.values()]?.[0] instanceof Konva.Group ||
          this.selected.size > 1)
      ) {
        anchor.visible(false);
      }
      const setAnchorCursor = (cursor: string = '') => {
        const anchorStage = anchor.getStage();
        if (!anchorStage || !anchorStage.content) {
          return;
        }
        anchorStage.content.style.cursor = cursor;
      };
      anchor.on('mousedown', () => {
        this.enabled = false;
      });
      anchor.on('mouseup', () => {
        this.enabled = true;
      });
      anchor.on('mouseenter', () => {
        this.enabled = false;
        if (!anchor.hasName('rotater')) {
          return;
        }
        setAnchorCursor('grabbing');
      });
      anchor.on('mouseout', () => {
        this.enabled = true;
        if (!anchor.hasName('rotater')) {
          return;
        }
        setAnchorCursor();
      });
    });

    this.optionLayer.add(this.transformer);

    this.rubberRect = new Konva.Rect({
      stroke: 'rgb(157, 157, 231)',
      fill: 'rgba(157, 157, 231, 0.5)',
      strokeWidth: 2,
      strokeScaleEnabled: false,
    });
    this.optionLayer.add(this.rubberRect);

    this.transformer.on<'transformstart'>('transformstart', this.onTransformStart);
    this.transformer.on<'transformend'>('transformend', this.onTransformEnd);
    this.transformer.on<'dragstart'>('dragstart', this.onDragStart);
    this.transformer.on<'dragend'>('dragend', this.onDragEnd);

    this.app.on('mouse:down', this.onMouseDown);
    this.app.on('mouse:move', this.onMouseMove);
    this.app.on('mouse:up', this.onMouseUp);
    this.app.on('mouse:click', this.onMouseClick);
    this.app.on('mouse:out', this.onMouseOut);
  }

  private handleNodeRemoved = ({ target }: any): void => {
    this.cancelSelect(target);
    target.off('removed', this.handleNodeRemoved);
  };

  public select(...nodes: KonvaNode[]): void {
    if (!this.enabled) {
      return;
    }
    if (util.shapeArrayEqual(nodes, [...this.selected.values()])) {
      return;
    }
    this.cancelSelect();
    this.transformer.nodes(
      nodes.filter((node) => {
        node.draggable(true);
        node.on<'removed'>('removed', this.handleNodeRemoved);
        this.selected.set(node.id(), node);
        return node !== this.rubberRect;
      })
    );
    this.setHightRect(...nodes);
    this.app.render();
    this.app.emit('selected:changed', { selected: [...this.selected.values()] });
  }

  public cancelSelect(...nodes: KonvaNode[]): void {
    if (this.selected.size === 0) {
      return;
    }
    if (nodes.length === 0) {
      nodes = [...this.selected.values()];
    }
    nodes.forEach((node) => {
      node.draggable(false);
      node.off('removed', this.handleNodeRemoved);
      this.selected.delete(node.id());
    });
    this.removeHightRect(...nodes);
    this.transformer.nodes([...this.selected.values()]);
    this.app.emit('selected:changed', { selected: [...this.selected.values()] });
  }

  public selectAll(): void {
    this.select(...this.app.mainLayer.getChildren());
  }

  public triggerSelector(enable?: boolean): void {
    if (enable === void 0) {
      this.enabled = !this.enabled;
    } else {
      this.enabled = enable;
    }
    if (!this.enabled) {
      this.rubberEnable = false;
    }
  }

  public isSelected(node: KonvaNode): boolean {
    return this.selected.has(node.id());
  }

  public getSelectClientRect(): {
    width: number;
    height: number;
    x: number;
    y: number;
  } {
    return this.transformer.getClientRect();
  }

  private setHightRect(...nodes: KonvaNode[]) {
    this.hightLightRects = nodes.reduce((hightRects, node) => {
      const rect = new Konva.Rect({
        stroke: this.hightLightConfig.stroke,
        strokeWidth: this.hightLightConfig.strokeWidth,
        dash: this.hightLightConfig.dash,
        fillEnabled: false,
        strokeScaleEnabled: false,
      });
      this.calculateNodeRect(node, rect, this.hightLightConfig.padding ?? 0);
      this.optionLayer.add(rect);

      const transformHandler = () =>
        requestAnimationFrame(() => this.calculateNodeRect(node, rect, this.hightLightConfig.padding ?? 0));

      node.on('dragmove transform xChange yChange', transformHandler);

      hightRects.set(node.id(), {
        rect,
        transformHandler,
      });
      return hightRects;
    }, new Map<string, HightLightRect>());
  }

  private removeHightRect(...nodes: KonvaNode[]) {
    nodes.forEach((node) => {
      const hightLight = this.hightLightRects.get(node.id());
      if (!hightLight) {
        return;
      }
      node.off('dragmove transform xChange yChange', hightLight.transformHandler);
      hightLight.rect.remove();
      this.hightLightRects.delete(node.id());
    });
  }

  private calculateNodeRect(node: KonvaNode, rect: Konva.Rect, padding: number = 0): void {
    if (node instanceof Konva.Group) {
      const box = node.getClientRect();
      rect.position({ x: box.x - padding, y: box.y - padding });
      rect.width(box.width + padding * 2);
      rect.height(box.height + padding * 2);
    } else {
      const position = this.getNodeRectPosition(node, padding);
      const size = {
        width: node.width() * node.scaleX(),
        height: node.height() * node.scaleY(),
      };
      const canvasScaleX = this.app.stage.scaleX();
      const canvasScaleY = this.app.stage.scaleY();
      const canvasOffsetX = this.app.stage.x();
      const canvasOffsetY = this.app.stage.y();
      rect.position({
        x: (position.x - canvasOffsetX) / canvasScaleX,
        y: (position.y - canvasOffsetY) / canvasScaleY,
      });
      rect.width(size.width + padding * 2);
      rect.height(size.height + padding * 2);
      rect.rotation(node.rotation());
    }
  }

  private getNodeRectPosition(node: KonvaNode, padding: number = 0): util.Point {
    const getAngle = (angle: number): number => {
      return Konva.angleDeg ? (angle * Math.PI) / 180 : angle;
    };
    const totalPoints: Array<util.Point> = [];
    const box = node.getClientRect({
      skipTransform: true,
      skipShadow: true,
      skipStroke: this.transformer.ignoreStroke(),
    });
    let points = [
      { x: box.x, y: box.y },
      { x: box.x + box.width, y: box.y },
      { x: box.x + box.width, y: box.y + box.height },
      { x: box.x, y: box.y + box.height },
    ];
    let trans = node.getAbsoluteTransform();
    points.forEach(function (point) {
      let transformed = trans.point(point);
      totalPoints.push(new util.Point(transformed.x, transformed.y));
    });
    const tr = new Konva.Transform();
    tr.rotate(-getAngle(node.rotation()));
    let x: number | undefined;
    let y: number | undefined;
    totalPoints.forEach(function (point) {
      let transformed = tr.point(point);
      if (x === undefined || y === undefined) {
        x = transformed.x;
        y = transformed.y;
      }
      x = Math.min(x, transformed.x);
      y = Math.min(y, transformed.y);
    });
    tr.invert();
    const p = tr.point({ x: (x ?? 0) - padding, y: (y ?? 0) - padding });
    return new util.Point(p.x, p.y);
  }

  private onTransformStart = (): void => {
    this.app.emit('node:transform:start', { nodes: [...this.selected.values()] });
    this.app.emit('node:update:before', { nodes: [...this.selected.values()] });
  };

  private onTransformEnd = (): void => {
    this.app.emit('node:transform:end', { nodes: [...this.selected.values()] });
    this.app.emit('node:updated', { nodes: [...this.selected.values()] });
  };

  private onDragStart = (): void => {
    this.app.emit('node:transform:start', { nodes: [...this.selected.values()] });
    this.app.emit('node:update:before', { nodes: [...this.selected.values()] });
  };

  private onDragEnd = (): void => {
    this.app.emit('node:transform:end', { nodes: [...this.selected.values()] });
    this.app.emit('node:updated', { nodes: [...this.selected.values()] });
  };

  private onMouseDown = ({ event }: EventArgs['mouse:down']): void => {
    if (!this.enabled || event.evt.button !== 0) {
      return;
    }
    if (event.target instanceof Konva.Stage) {
      this.cancelSelect();
      this.rubberStartPoint.clone(this.app.pointer);
      this.rubberRect.setPosition(this.rubberStartPoint);
      this.rubberRect.width(0);
      this.rubberRect.height(0);
      this.rubberRect.visible(false);
      this.rubberEnable = true;
    }
  };

  private onMouseMove = (): void => {
    if (!this.enabled) {
      return;
    }
    if (!this.rubberEnable) {
      return;
    }
    // 如果弹性框选可用，则改变弹性框的尺寸
    const position = new util.Point(
      Math.min(this.app.pointer.x, this.rubberStartPoint.x),
      Math.min(this.app.pointer.y, this.rubberStartPoint.y)
    );
    this.rubberRect.setPosition(position);
    this.rubberRect.width(Math.max(this.app.pointer.x, this.rubberStartPoint.x) - position.x);
    this.rubberRect.height(Math.max(this.app.pointer.y, this.rubberStartPoint.y) - position.y);
    this.rubberRect.visible(true);
  };

  private onMouseUp = ({ event }: EventArgs['mouse:up']): void => {
    if (!this.enabled || event.evt.button !== 0) {
      return; // 未启用时直接返回
    }

    if (this.rubberEnable) {
      const shapesInRubberRect = this.app.getShapesInArea(this.rubberRect);
      this.select(...shapesInRubberRect);
      this.rubberRect.visible(false);
      this.rubberEnable = false;
      return; // 橡皮擦模式处理后直接返回
    }
  };

  private onMouseClick = ({ event }: EventArgs['mouse:click']): void => {
    if (!this.enabled || event.evt.button !== 0) {
      return; // 未启用时直接返回
    }

    if (event.target instanceof Konva.Stage || !event.target.attrs.id) {
      return; // 如果是舞台或者没有ID属性，直接返回
    }

    // 如果同时按下了shift键则认为是多选模式
    if (event.evt.shiftKey && this.multipleSelect) {
      if (this.selected.has(event.target.attrs.id)) {
        this.cancelSelect(event.target);
      } else {
        this.select(...this.selected.values(), event.target);
      }
    } else {
      const topGroup = this.app.findTopGroup(event.target);
      if (topGroup) {
        this.select(topGroup);
      } else {
        this.select(event.target);
      }
    }
  };

  private onMouseOut = ({ event }: EventArgs['mouse:out']): void => {
    if (event.target instanceof Konva.Stage) {
      this.rubberEnable = false;
    }
  };

  public destroy(): void {
    this.transformer.off('transformstart', this.onTransformStart);
    this.transformer.off('transformend', this.onTransformEnd);
    this.transformer.off('dragstart', this.onDragStart);
    this.transformer.off('dragend', this.onDragEnd);
    this.app.off('mouse:down', this.onMouseDown);
    this.app.off('mouse:move', this.onMouseMove);
    this.app.off('mouse:up', this.onMouseUp);
    this.app.off('mouse:click', this.onMouseClick);
    this.app.off('mouse:out', this.onMouseOut);
    this.selected.clear();
    this.enabled = false;
    this.transformer.remove();
    this.optionLayer.remove();
  }
}

export default Selector;
