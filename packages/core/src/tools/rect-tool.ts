import { fabric } from 'fabric';

import { PRect } from '../customs/rect';
import { AppMouseEvent, Tool } from '../types';

import { selectTool } from './select-tool';

class RectTool implements Tool {
  public name: string = 'rectTool';
  public drawable: boolean = true;
  private startPointer: fabric.Point = new fabric.Point(0, 0);
  private rectangle: PRect | null = null;

  public onMouseDown({ app }: AppMouseEvent): void {
    app.canvas.selection = false;
    this.startPointer = app.pointer;
    this.rectangle = new PRect({
      left: this.startPointer.x,
      top: this.startPointer.y,
      width: 10,
      height: 10,
      fill: 'transparent',
      stroke: 'black',
      strokeWidth: 2,
    });
    app.canvas.add(this.rectangle);
  }

  public onMouseMove({ app }: AppMouseEvent): void {
    if (!this.rectangle) {
      return;
    }
    const width = app.pointer.x - this.startPointer.x;
    const height = app.pointer.y - this.startPointer.y;
    this.rectangle.set({ width, height });
    app.render();
  }

  public onMouseUp({ app }: AppMouseEvent): void {
    app.setTool(selectTool);
    this.startPointer.setXY(0, 0);
    if (this.rectangle) {
      app.canvas.setActiveObject(this.rectangle);
    }
    this.rectangle = null;
    app.render(true);
  }
}

export const rectTool = new RectTool();

export default rectTool;
