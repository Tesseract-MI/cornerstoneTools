/* eslint-disable no-console */
import external from '../../externalModules.js';
import BaseAnnotationTool from '../base/BaseAnnotationTool.js';
// State
import { getToolState, addToolState } from '../../stateManagement/toolState.js';
import textStyle from '../../stateManagement/textStyle.js';
import toolColors from '../../stateManagement/toolColors.js';
import { state } from '../../store/index.js';
// Drawing
import { getNewContext, draw } from '../../drawing/index.js';
import drawTextBox from '../../drawing/drawTextBox.js';
import drawHandles from '../../drawing/drawHandles.js';
// Utilities
import getRGBPixels from '../../util/getRGBPixels.js';
import { probeCursor } from '../cursors/index.js';
import { getLogger } from '../../util/logger.js';
import throttle from '../../util/throttle';
import { calculateCancerRisk } from '../../util/calculateCancerRisk.js';

const logger = getLogger('tools:annotation:AIProbeTool');

/**
 * @public
 * @class AIProbeTool
 * @memberof Tools.Annotation
 * @classdesc Tool which provides a probe of the image data at the
 * desired position.
 * @extends Tools.Base.BaseAnnotationTool
 */
export default class AIProbeTool extends BaseAnnotationTool {
  constructor(props = {}) {
    const defaultProps = {
      name: 'AIProbe',
      supportedInteractionTypes: ['Mouse', 'Touch'],
      svgCursor: probeCursor,
    };

    super(props, defaultProps);

    this.throttledUpdateCachedStats = throttle(this.updateCachedStats, 110);
  }

  getPointNearToolIndex(element, toolData, coords) {
    for (let i = 0; i < toolData.data.length; i++) {
      const data = toolData.data[i];

      if (this.pointNearTool(element, data, coords)) {
        return i;
      }
    }
  }

  preMouseDownCallback(evt) {
    const eventData = evt.detail;
    const element = eventData.element;
    const coords = evt.detail.currentPoints.canvas;
    const toolData = getToolState(evt.currentTarget, this.name);

    if (!toolData) {
      return;
    }

    const data =
      toolData.data[this.getPointNearToolIndex(element, toolData, coords)];

    if (!data) {
      return;
    }

    data.isDrag = true;
  }

  mouseMoveCallback(evt) {
    const eventData = evt.detail;
    const element = eventData.element;
    const coords = evt.detail.currentPoints.canvas;
    const toolData = getToolState(evt.currentTarget, this.name);
    const data =
      toolData.data[this.getPointNearToolIndex(element, toolData, coords)];

    if (!data) {
      return;
    }

    if (data.isDrag) {
      data.cancerRisk = 'calculating...';
      external.cornerstone.updateImage(eventData.element);

      calculateCancerRisk(eventData.image.imageId, data.handles.end).then(
        cancerRisk => {
          data.cancerRisk = cancerRisk.description.substring(0, 5);
          external.cornerstone.updateImage(eventData.element);
        }
      );
      data.isDrag = false;
    }
  }

  createNewMeasurement(eventData) {
    const goodEventData =
      eventData && eventData.currentPoints && eventData.currentPoints.image;

    if (!goodEventData) {
      logger.error(
        `required eventData not supplied to tool ${
          this.name
        }'s createNewMeasurement`
      );

      return;
    }
    // Console.log('state loop');

    // state.tools.forEach(function(tool) {
    //   const toolState = getToolState(eventData.element, tool.name);

    //   console.log(toolState);
    // });

    const data = {
      visible: true,
      active: true,
      color: undefined,
      isDrag: false,
      fid: 0,
      invalidated: true,
      cancerRisk: 'calculating...',
      handles: {
        end: {
          x: eventData.currentPoints.image.x,
          y: eventData.currentPoints.image.y,
          highlight: true,
          active: true,
        },
      },
    };

    calculateCancerRisk(eventData.image.imageId, data.handles.end).then(
      cancerRisk => {
        data.cancerRisk = cancerRisk.description.substring(0, 5);
        external.cornerstone.updateImage(eventData.element);
      }
    );

    return data;
  }

  /**
   *
   *
   * @param {*} element
   * @param {*} data
   * @param {*} coords
   * @returns {Boolean}
   */
  pointNearTool(element, data, coords) {
    const hasEndHandle = data && data.handles && data.handles.end;
    const validParameters = hasEndHandle;

    if (!validParameters) {
      logger.warn(
        `invalid parameters supplied to tool ${this.name}'s pointNearTool`
      );
    }

    if (!validParameters || data.visible === false) {
      return false;
    }

    const probeCoords = external.cornerstone.pixelToCanvas(
      element,
      data.handles.end
    );

    return external.cornerstoneMath.point.distance(probeCoords, coords) < 5;
  }

  updateCachedStats(image, element, data) {
    const x = Math.round(data.handles.end.x);
    const y = Math.round(data.handles.end.y);

    const stats = {};

    if (x >= 0 && y >= 0 && x < image.columns && y < image.rows) {
      stats.x = x;
      stats.y = y;

      if (image.color) {
        stats.storedPixels = getRGBPixels(element, x, y, 1, 1);
      } else {
        stats.storedPixels = external.cornerstone.getStoredPixels(
          element,
          x,
          y,
          1,
          1
        );
      }
    }

    data.cachedStats = stats;
    data.invalidated = false;
  }

  renderToolData(evt) {
    const eventData = evt.detail;
    const { handleRadius } = this.configuration;
    const toolData = getToolState(evt.currentTarget, this.name);
    const probeState = getToolState(evt.currentTarget, 'Probe');
    let numberOfTools = 0;

    if (!toolData) {
      return;
    }

    try {
      numberOfTools += toolData.data.length;
    } catch (err) {
      numberOfTools += 0;
    }

    try {
      numberOfTools += probeState.data.length;
    } catch (err) {
      numberOfTools += 0;
    }

    // We have tool data for this element - iterate over each one and draw it
    const context = getNewContext(eventData.canvasContext.canvas);
    const { image, element } = eventData;
    const fontHeight = textStyle.getFontSize();

    for (let i = 0; i < toolData.data.length; i++) {
      const data = toolData.data[i];

      if (data.visible === false) {
        continue;
      }

      if (data.fid === 0) {
        data.fid = numberOfTools;
      }

      draw(context, context => {
        const color = toolColors.getColorIfActive(data);

        // Draw the handles
        drawHandles(context, eventData, data.handles, {
          handleRadius,
          color,
        });

        // Update textbox stats
        if (data.invalidated === true) {
          if (data.cachedStats) {
            this.throttledUpdateCachedStats(image, element, data);
          } else {
            this.updateCachedStats(image, element, data);
          }
        }

        let text;
        const { x, y } = data.cachedStats;

        if (x >= 0 && y >= 0 && x < image.columns && y < image.rows) {
          text = `${data.fid}`;

          // Coords for text
          const coords = {
            // Translate the x/y away from the cursor
            x: data.handles.end.x + 3,
            y: data.handles.end.y - 3,
          };
          const textCoords = external.cornerstone.pixelToCanvas(
            eventData.element,
            coords
          );

          drawTextBox(
            context,
            `Cancer risk: ${data.cancerRisk}`,
            textCoords.x,
            textCoords.y + fontHeight + 5,
            color
          );

          drawTextBox(context, text, textCoords.x, textCoords.y, color);
        }
      });
    }
  }
}
