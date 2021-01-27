<template>
<div :id="id" class="chart">
  <h6 v-if="title !== undefined">{{ title }}</h6>
  <div class="chart-container">
    <svg width="100%" height="100%" />
  </div>
</div>
</template>

<script lang="ts">
import { findMaxMetricValue, formatTimeTicks } from '@/utils';
import { Annotation, AnnotationHelperPosition, ZoomLimits, AxisType } from '@/types';

import { Component, Vue, Prop, Watch } from 'vue-property-decorator';

import * as d3 from 'd3';
import * as _ from 'lodash';

const SECONDS_IN_DAY = 24 * 60 * 60;

const DEFAULT_MARGIN = { top: 20, right: 40, bottom: 20, left: 70 };

const ANNOTATION_HELPER_PARAMS = { lineX1: 0, lineX2: 3, circleX: 8, textX: 11 };

const DEFAULT_ZOOM_LIMITS: ZoomLimits = { max: SECONDS_IN_DAY * 2, min: 5 * 60 };

@Component
export default class VueChart extends Vue {

  d3Node: any;
  svg: any;
  crosshair: any;
  brush: any;
  xScale: any;

  @Prop({ required: true })
  id!: number;

  @Prop({ required: false, default: AxisType.TIME })
  xAxisType!: AxisType;

  @Prop({ required: true })
  columns!: string[];

  @Prop({ required: true })
  values!: [number, number][];

  @Prop({ required: true })
  colors!: string[];

  @Prop({ required: false })
  zoom!: any;

  @Prop({ required: false, default: () => [] })
  annotations!: Annotation[];

  @Prop({ required: false, default: '' })
  annotationLabel!: string;

  @Prop({ required: false, default: AnnotationHelperPosition.NONE })
  annotationHelper!: AnnotationHelperPosition;

  @Prop({ required: false })
  title!: string;

  @Prop({ required: false, default: () => DEFAULT_MARGIN })
  margin!: { top: number, right: number, bottom: number, left: number };

  @Prop({ required: false })
  maxValues!: number[];

  @Prop({ required: false, default: true })
  renderLabelX!: boolean;

  @Prop({ required: false })
  yAxisTransform!: number;

  @Prop({ required: false, default: 0.5 })
  strokeOpacity!: number;

  @Prop({ required: false, default: () => DEFAULT_ZOOM_LIMITS })
  zoomLimits!: ZoomLimits;

  @Prop({ required: false, default: null })
  sharedCrosshairPosition!: number | null;

  @Watch('values')
  onTimeSeriesChange(): void {
    this.renderChart();
  }

  @Watch('zoom')
  onZoomChange(): void {
    if(this.zoom !== undefined && this.zoom.renderChart !== undefined && this.zoom.renderChart === true) {
      this.renderChart();
    }
  }

  @Watch('yAxisTransform')
  onYAxisTransformChange(newValue: number): void {
    this.pathTransform(newValue);
  }

  @Watch('sharedCrosshairPosition')
  onSharedCrosshairPositionChange(newValue: number | null): void {
    // TODO: remove duplicates with mouse move
    if(newValue === null) {
      this.crosshair.style('display', 'none');
      return;
    }
    this.displayCrosshair(newValue);
    const value = this.getSeriesValuesFromYposition(newValue);
    this.$emit('sharedCrosshairChange', value);
  }

  get metricNames(): string[] {
    return this.columns;
  }

  get width(): number {
    const svgContainer: any = this.d3Node.select('.chart-container');
    return svgContainer.node().clientWidth - this.margin.left - this.margin.right;
  }

  get height(): number {
    const svgContainer: any = this.d3Node.select('.chart-container');
    return svgContainer.node().clientHeight - this.margin.top - this.margin.bottom;
  }

  get maxMetricValue(): number | undefined {
    let maxValue = undefined;
    if(maxValue === undefined) {
      const maxMetricValue = _.max(
        this.metricNames.map(
          (metric: string, idx: number) => findMaxMetricValue(this.values, idx + 1)
        )
      );
      if(maxMetricValue !== undefined) {
        maxValue = maxMetricValue;
      }
    }
    return maxValue;
  }

  // TODO: refactor: duplication with zoomLowerValue
  get zoomLowerIndex(): any {
    if(this.zoom !== undefined && this.zoom.x !== undefined) {
      let index = _.findIndex(this.values, value => value[0] >= this.zoom.x[0]);
      if(index > 0) {
        index--;
      }
      return index;
    }

    let lowerValue = 0;
    const valuesLength = this.values.length;
    if(this.zoom !== undefined && valuesLength > this.zoom) {
      lowerValue = this.values.length - this.zoom;
    }
    return lowerValue;
  }

  // TODO: refactor: duplication with zoomUpperValue
  get zoomUpperIndex(): any {
    if(this.zoom !== undefined && this.zoom.x !== undefined && this.zoom.x[1] !== undefined) {
      let index = _.findLastIndex(this.values, value => value[0] <= this.zoom.x[1]);
      if(index < this.values.length - 1) {
        index++;
      }
      return index;
    }

    return this.values.length - 1;
  }

  get zoomLowerValue(): any {
    if(this.zoom !== undefined && this.zoom.x !== undefined) {
      return this.zoom.x[0];
    }

    let lowerValue = 0;
    const valuesLength = this.values.length;
    if(this.zoom !== undefined && valuesLength > this.zoom) {
      lowerValue = this.values.length - this.zoom;
    }
    if(this.values === undefined || this.values.length === 0) {
      return;
    }
    
    switch(this.xAxisType) {
      case AxisType.TIME:
        return new Date(this.values[lowerValue][0]);
      case AxisType.NUMERIC:
        return this.values[lowerValue][0];
      default:
        throw new Error(`Unknown axis type: ${this.xAxisType}`);
    }
  }

  get zoomUpperValue(): any {
    if(this.zoom !== undefined && this.zoom.x !== undefined && this.zoom.x[1] !== undefined) {
      return this.zoom.x[1];
    }
    if(this.values === undefined || this.values.length === 0) {
      return;
    }
    
    switch(this.xAxisType) {
      case AxisType.TIME:
        return new Date(this.values[this.values.length - 1][0]);
      case AxisType.NUMERIC:
        return this.values[this.values.length - 1][0];
      default:
        throw new Error(`Unknown axis type: ${this.xAxisType}`);
    }
  }

  @Watch('zoomLowerValue')
  @Watch('zoomUpperValue')
  onZoomValueChange() {
    this.xScale.domain([
      this.zoomLowerValue,
      this.zoomUpperValue
    ]);
  }

  get yScale(): any {
    // y is horizontal axis
    return d3.scaleLinear()
      .domain([0, 1])
      .range([0, this.width]);
  }

  get labelX(): any {
    if(this.renderLabelX === true ) {
      switch(this.xAxisType) {
        case AxisType.TIME:
          return formatTimeTicks;
        case AxisType.NUMERIC:
          return (label: string) => label;
        default:
          throw new Error(`Unknown axis type: ${this.xAxisType}`);
      }
    } else {
      return () => {''};
    }
  }

  get annotationsInTimerange(): Annotation[] {
    return this.annotations.filter(
      annotation => {
        const topBound = annotation.date >= this.zoom.x[0];
        let bottomBound = true;
        if(this.zoom.x[1] !== undefined) {
          bottomBound =  annotation.date <= this.zoom.x[1];
        }
        return topBound && bottomBound;
      }
    );
  }

  _createSvg(): void {
    this.d3Node.selectAll('svg *').remove();

    this.svg = this.d3Node
      .select('svg')
      .append('g')
        .attr('transform', `translate(${this.margin.left},0)`);

    this.svg
      .append('clipPath')
        .attr('id', `clip-${this.id}`)
      .append('rect')
        .attr('x', 0)
        .attr('y', 0)
        .attr('width', this.width)
        .attr('height', this.height);

    this.svg
      .append('clipPath')
        .attr('id', `axis-clip-${this.id}`)
      .append('rect')
        .attr('x', -this.margin.left)
        .attr('y', 0)
        .attr('width', this.margin.left)
        .attr('height', this.height);
  }

  _onPanningEnd(): void {
    this.$emit('pan', [
      this.xScale.invert(this.xScale(this.zoomLowerValue) - d3.event.transform.y),
      this.xScale.invert(this.xScale(this.zoomUpperValue) - d3.event.transform.y)
    ]);
  }

  _onPanningZoom(): void {
    this.$emit('tooltip', { displayed: false });
    this.$emit('shiftPan', d3.event.transform.y);
  }

  pathTransform(transform: number): void {
    // TODO: one class for all transformable elements
    let metrics = this.svg.selectAll('.metric-path');
    let yAxis = this.svg.selectAll('.y0-axis');
    let annotations = this.svg.selectAll('.annotation');
    let crosshairLines = this.svg.selectAll('.crosshair-line');
    let crosshairCircles = this.svg.selectAll('.crosshair-circle');
    metrics
      .attr('transform', `translate(0,${transform})`);
    yAxis
      .attr('transform', `translate(0,${transform})`);
    annotations
      .attr('transform', `translate(0,${transform})`);
    crosshairLines
      .attr('transform', `translate(0,${transform})`);
    crosshairCircles
      .attr('transform', `translate(0,${transform})`);

    if(this.renderLabelX) {
      let lowerValue = this.xScale(this.zoomLowerValue)
      let upperValue = this.xScale(this.zoomUpperValue);
      lowerValue -= transform;
      upperValue -= transform;

      this.xScale.domain([this.xScale.invert(lowerValue), this.xScale.invert(upperValue)]);

      this.svg.select('g.y-axis').remove();
      this.svg.select('g.y0-axis').remove();
      this._renderYAxis();
    }
  }

  _renderXAxis(): void {
    this.svg.append('g')
      .attr('class', 'x-axis')
      .attr('transform', `translate(0,${this.height})`)
      // TODO: number of ticks shouldn't be hardcoded
      .call(d3.axisBottom(this.yScale).ticks(4).tickSize(2));
  }

  _renderYAxis(): void {
    this.svg
      .append('g')
        .attr('clip-path', `url(#axis-clip-${this.id})`)
      .append('g')
        .attr('class', `y0-axis`)
        .call(d3.axisLeft(this.xScale).tickFormat(this.labelX).tickSize(2).tickPadding(15));

    this.svg.append('g')
      .attr('class', `y-axis`)
      .call(d3.axisLeft(this.xScale).tickFormat((): any => {''}).tickSize(0));
  }

  _renderMetric(name: string, idx: number): void {
    const lineGenerator = d3.line()
      .x((d: any) => this.yScale(d[idx + 1] / this.maxValues[idx]))
      .y((d: any) => this.xScale(d[0]));

    this.svg
      .append('g')
        .attr('clip-path', `url(#clip-${this.id})`)
        .style('pointer-events', 'none')
      .append('path')
        .datum(_.slice(this.values, this.zoomLowerIndex, this.zoomUpperIndex + 1))
        .attr('class', 'metric-path')
        .attr('fill', 'none')
        .attr('stroke', this.colors[idx])
        .attr('stroke-width', 1)
        .attr('stroke-opacity', this.strokeOpacity)
        .attr('d', lineGenerator);
  }

  _renderAnnotations(): void {
    this.svg.selectAll()
      .data(this.annotationsInTimerange)
      .enter()
      .append('line')
        .attr('class', 'annotation')
        .attr('x1', this.yScale(0))
        .attr('x2', this.yScale(1))
        .attr('y1', (d: any) => this.xScale(d.date))
        .attr('y2', (d: any) => this.xScale(d.date))
        .attr('style', 'stroke:black;stroke-width:1;stroke-dasharray:2,2;')
        .attr('stroke-opacity', this.strokeOpacity);

    if(this.annotationHelper !== AnnotationHelperPosition.NONE) {
      this._renderAnnotationsHelper();
    }
  }

  _renderAnnotationsHelper(): void {
    // TODO: refactor
    let k = -1;
    let shift = 0;
    if (this.annotationHelper === AnnotationHelperPosition.RIGHT) {
      k = 1;
      shift = this.yScale(1);
    }

    this.svg.selectAll()
      .data(this.annotationsInTimerange)
      .enter()
      .append('line')
        .attr('class', 'annotation')
        .attr('x1', shift + k * ANNOTATION_HELPER_PARAMS.lineX1)
        .attr('x2', shift + k * ANNOTATION_HELPER_PARAMS.lineX2)
        .attr('y1', (d: any) => this.xScale(d.date))
        .attr('y2', (d: any) => this.xScale(d.date))
        .attr('style', 'stroke:black;stroke-width:1;stroke-dasharray:5,5;')
        .on('mouseover', this.onAnnotationMouseOver)
        .on('mousemove', this.onAnnotationMouseMove)
        .on('mouseleave', this.onAnnotationMouseLeave);

    this.svg.selectAll()
      .data(this.annotationsInTimerange)
      .enter()
      .append('circle')
        .attr('class', 'annotation')
        .attr('cx', shift + k * ANNOTATION_HELPER_PARAMS.circleX)
        .attr('cy', (d: any) => this.xScale(d.date))
        .attr('r', 5 )
        .attr('style', 'stroke:black;stroke-width:1;fill:white;')
        .on('mouseover', this.onAnnotationMouseOver)
        .on('mousemove', this.onAnnotationMouseMove)
        .on('mouseleave', this.onAnnotationMouseLeave)
        .on('click', (d: any) => this.$emit('click', d));

    this.svg.selectAll()
      .data(this.annotationsInTimerange)
      .enter()
      .append('text')
        .attr('class', 'annotation')
        .attr('x', shift + k * ANNOTATION_HELPER_PARAMS.textX)
        .attr('y', (d: any) => this.xScale(d.date) + 3)
        .text(this.annotationLabel)
        .attr('font-size', '10px')
        .attr('font-weght', 'bold')
        .attr('cursor', 'default')
        .on('mouseover', this.onAnnotationMouseOver)
        .on('mousemove', this.onAnnotationMouseMove)
        .on('mouseleave', this.onAnnotationMouseLeave);
  }

  _renderCrosshair(): void {
    this.crosshair = this.svg.append('g')
      .style('display', 'none');

    this.crosshair.append('line')
      .attr('class', 'crosshair-line')
      .attr('id', `crosshair-line-y-${this.id}`)
      .attr('fill', 'none')
      .attr('stroke', 'red')
      .attr('stroke-width', '0.5px');

    if(this.values !== undefined && this.values[0] !== undefined) {
      for(let i = 0; i < this.values[0].length - 1; i++) {
        this.crosshair.append('circle')
          .attr('class', 'crosshair-circle')
          .attr('id', `crosshair-circle-${i}-${this.id}`)
          .attr('r', 2)
          .style('fill', 'white')
          .style('stroke', 'red')
          .style('stroke-width', '1px');
      }
    }

    const onMouseMove = this.onMouseMove.bind(this);
    this.svg.append('rect')
      .style('fill', 'none')
      .style('stroke', 'none')
      .style('pointer-events', 'all')
      .style('cursor', 'crosshair')
      .attr('width', this.width)
      .attr('height', this.height)
      .on('mouseover', this.onMouseOver.bind(this))
      .on('mouseout', this.onMouseOut.bind(this))
      .on('mousemove', function() {
        // @ts-ignore
        const coordinates = d3.mouse(this);
        onMouseMove(coordinates);
      });
  }

  displayCrosshair(layerY: number): void {
    this.crosshair.style('display', null);
    this.crosshair.select(`#crosshair-line-y-${this.id}`)
      .attr('x1', this.yScale(0)).attr('y1', layerY)
      .attr('x2', this.yScale(1)).attr('y2', layerY);
  }

  getSeriesValuesFromYposition(yCoordinate: number): string | undefined {
    const bisectDate = d3.bisector((d: [number, number]) => d[0]).left;
    const mouseDate = this.xScale.invert(yCoordinate);
    const i = bisectDate(this.values, mouseDate);

    const d0 = this.values[i - 1];
    const d1 = this.values[i];

    let yOffset = 0;

    if(this.values === undefined || this.values[0] === undefined) {
      return;
    }

    if(this.values[0].length >= 4) {
      yOffset = (this.values[0].length - 4) * 30;
    }

    let value;
    if(d1 !== undefined && d0 !== undefined) {
      const d = mouseDate - d0[0] > d1[0] - mouseDate ? d1 : d0;

      value = d[0].toLocaleString();
      for(let i = 1; i < d.length; i++) {
        value += `<br/><p style="color: ${this.colors[i]}">${this.metricNames[i - 1]}</p>: ${d[i] !== undefined ? d[i].toFixed(2) : ''}`
      }
      for(let i = 0; i < this.values[0].length - 1; i++) {
        const x = this.yScale(d[i + 1] / this.maxValues[i]);
        const y = this.xScale(d[0]);
        this.crosshair.select(`#crosshair-circle-${i}-${this.id}`)
          .attr('cx', x)
          .attr('cy', y);
      }
    }
    return value;
  }

  onMouseMove(coordinates: [number, number]): void {
    if(this.values.length === 0) {
      this.onMouseOut();
      return;
    }

    this.displayCrosshair(coordinates[1]);

    let yOffset = 0;
    if(this.values[0].length >= 4) {
      yOffset = (this.values[0].length - 4) * 30;
    }

    const value = this.getSeriesValuesFromYposition(coordinates[1]);
    this.$emit('mouse-move', {
      mouse: [d3.event.clientX, d3.event.clientY - yOffset],
      positionY: coordinates[1],
      value
    });
  }

  onMouseOver(): void {
    this.$emit('mouse-over');
    this.crosshair.style('display', null);
  }

  onMouseOut(): void {
    this.$emit('mouse-out');
    this.crosshair.style('display', 'none');
  }

  renderChart(): void {
    console.log('re-render');

    switch(this.xAxisType) {
      case AxisType.TIME:
        this.xScale = d3.scaleTime()
          .domain([
            this.zoomLowerValue,
            this.zoomUpperValue
          ])
          .range([0, this.height]);
        break;
      case AxisType.NUMERIC:
        this.xScale = d3.scaleLinear()
          .domain([
            this.zoomLowerValue,
            this.zoomUpperValue
          ])
          .range([0, this.height]);
        break;
      default:
        throw new Error(`Unknown axis type: ${this.xAxisType}`);
    }

    this._createSvg();
    this._renderXAxis();
    this._renderYAxis();

    if(this.metricNames.length === 0) {
      throw new Error('There should be at least 1 metric');
    }

    this.metricNames.forEach(this._renderMetric);
    this._renderCrosshair();

    this.brush = d3.brushY()
      .extent([
        [0,0],
        [this.width,this.height]
      ])
      .handleSize(20)
      .filter(() => !d3.event.shiftKey)
      .on('start', this.onBrushStart)
      .on('end', this.onBrushEnd)

    const onMouseMove = this.onMouseMove.bind(this)
    this.svg
      .call(this.brush)
      .call(
        d3.zoom()
          .filter(() => d3.event.shiftKey)
          .on('zoom', () => {
            this._onPanningZoom();
          })
          .on('end', () => {
            this._onPanningEnd();
          })
      )
      .on('mouseover', this.onMouseOver.bind(this))
      .on('mouseout', this.onMouseOut.bind(this))
      .on('mousemove', function() {
        // @ts-ignore
        const coordinates = d3.mouse(this);
        onMouseMove(coordinates);
      })
      .on('dblclick', this.zoomOut.bind(this));

    this._renderAnnotations();
  }

  onBrushStart(): void {
    this.$emit('tooltip', { displayed: false })
  }

  onBrushEnd(): void {
    const extent = d3.event.selection;
    if(extent === undefined || extent === null) {
      return;
    }
    const startDate = this.xScale.invert(extent[0]);
    const endDate = this.xScale.invert(extent[1]);

    switch(this.xAxisType) {
      case AxisType.TIME:
        const timestampRange = endDate.getTime() - startDate.getTime();;
        if(timestampRange / 1000 < this.zoomLimits.min) {
          this.svg
            .call(this.brush.move, null);
          return;
        }
        this.$emit('change-zoom', {
          start: startDate,
          end: endDate
        });
        break;
      case AxisType.NUMERIC:
        console.log(startDate, endDate)
        const range = endDate - startDate;
        this.$emit('change-zoom', {
          start: startDate,
          end: endDate
        });
        break;
      default:
        throw new Error(`Unknown axis type: ${this.xAxisType}`);
    }
  }

  zoomOut(): void {
    const startDate = this.xScale.invert(0);
    const endDate = this.xScale.invert(this.height);

    switch(this.xAxisType) {
      case AxisType.TIME:
        const timestampRange = endDate.getTime() - startDate.getTime();
        if(timestampRange / 1000 > this.zoomLimits.max) {
          return;
        }
        const midDate = this.xScale.invert(this.height / 2);
        const dayCount = this.zoomLimits.max / (2 * SECONDS_IN_DAY);
        const dateAfter = this.addDays(midDate, dayCount);
        const dateBefore = this.addDays(midDate, -1 * dayCount);
        this.$emit('change-zoom', {
          start: dateBefore,
          end: dateAfter
        });
        break;
      case AxisType.NUMERIC:
        const midValue = this.xScale.invert(this.height / 2);
        const valueAfter = midValue + 1000;
        const valueBefore = midValue - 1000;
        this.$emit('change-zoom', {
          start: valueBefore,
          end: valueAfter
        });
        break;
      default:
        throw new Error(`Unknown axis type: ${this.xAxisType}`);
    }
  }

  addDays(date: Date, days: number): Date {
    let result = new Date(date);
    result.setDate(result.getDate() + days);
    return result;
  }

  onAnnotationMouseOver(): void {
    d3.event.stopPropagation();
    this.$emit('tooltip', {
      displayed: true
    });
  }

  // TODO: not any
  onAnnotationMouseMove(d: any): void {
    d3.event.stopPropagation();
    this.$emit('tooltip', {
      displayed: true,
      x: d3.event.clientX - 125,
      y: d3.event.clientY - 70,
      content: d.text
    });
  }
  onAnnotationMouseLeave(): void {
    d3.event.stopPropagation();
    this.$emit('tooltip', {
      displayed: false
    });
  }

  mounted(): void {
    this.d3Node = d3.select(this.$el);

    this.renderChart();
  }
}
</script>

<style scoped>
.chart {
  width: 100%;
}

.chart-container {
  width: 100%;
  height: 350px;
}
h5 {
  font-size: 20pt;
}
</style>
