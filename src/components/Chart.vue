<template>
<div :id="id" class="chart">
  <h6>{{ title }}</h6>
  <div class="chart-container">
    <svg width="100%" height="100%"> </svg>
  </div>
</div>
</template>

<script lang="ts">
import { findMaxMetricValue, formatTimeTicks } from '@/utils';
import { Annotation, AnnotationHelperPosition } from '@/types';

import { Component, Vue, Prop, Watch } from 'vue-property-decorator';

import * as d3 from 'd3';
import * as _ from 'lodash';

const DEFAULT_MARGIN = { top: 20, right: 40, bottom: 20, left: 70 };

const ANNOTATION_HELPER_PARAMS = { lineX1: 0, lineX2: 3, circleX: 8, textX: 11 };

@Component
export default class MyChart extends Vue {

  d3Node: any;
  svg: any;
  tooltip: any;

  @Prop({ required: true })
  id!: number;

  @Prop({ required: true })
  columns!: string[];

  @Prop({ required: true })
  values!: number[][];

  @Prop({ required: true })
  colors!: string[];

  @Prop({ required: false })
  zoom!: any;

  @Prop({ required: false, default: [] })
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
  maxValue!: number;

  @Prop({ required: false, default: true })
  renderLabelX!: boolean;

  @Watch('values')
  onTimeSeriesChange(): void {
    this.renderChart();
  }

  @Watch('zoom')
  onZoomChange(): void {
    this.renderChart();
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

  get maxMetricValue(): number {
    let maxValue = this.maxValue;
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
    return new Date(this.values[lowerValue][0]);
  }

  get zoomUpperValue(): any {
    if(this.zoom !== undefined && this.zoom.x !== undefined && this.zoom.x[1] !== undefined) {
      return this.zoom.x[1];
    }

    return new Date(this.values[this.values.length - 1][0]);
  }

  get xScale(): any {
    // x is vertical axis
    return d3.scaleTime()
      .domain([
        this.zoomLowerValue,
        this.zoomUpperValue
      ])
      .range([0, this.height]);
  }

  get yScale(): any {
    // y is horizontal axis
    return d3.scaleLinear()
      .domain([0, this.maxMetricValue])
      .range([0, this.width]);
  }

  get labelX(): any {
    if (this.renderLabelX === true ) {
      return formatTimeTicks;
    } else {
      return () => {''};
    }
  }

  _createSvg(): void {
    this.d3Node.selectAll('svg *').remove();

    this.svg = this.d3Node
      .select('svg')
      .append('g')
        .attr('transform', `translate(${this.margin.left},${this.margin.top})`);
  }

  _renderAxes(): void {
    this.svg.append('g')
      .attr('class', 'x axis')
      .attr('transform', `translate(0,${this.height})`)
      // TODO: number of ticks shouldn't be hardcoded
      .call(d3.axisBottom(this.yScale).ticks(2).tickSize(2));

    this.svg.append('g')
      .attr('class', `y0 axis`)
      .call(d3.axisLeft(this.xScale).tickFormat(this.labelX).tickSize(2));
  }

  _renderMetric(name: string, idx: number): void {
    const lineGenerator = d3.line()
      .x((d: any) => this.yScale(d[idx + 1]))
      .y((d: any) => this.xScale(d[0]));

    this.svg.append('path')
      .datum(_.slice(this.values, this.zoomLowerIndex, this.zoomUpperIndex + 1))
      .attr('fill', 'none')
      .attr('stroke', this.colors[idx])
      .attr('stroke-width', 1)
      .attr('d', lineGenerator);
  }

  _renderAnnotations(): void {
    this.svg.selectAll()
      .data(this.annotations)
      .enter()
      .append('line')
        .attr('x1', this.yScale(0))
        .attr('x2', this.yScale(this.maxMetricValue))
        .attr('y1', (d: any) => this.xScale(new Date(d.timestamp * 1000)))
        .attr('y2', (d: any) => this.xScale(new Date(d.timestamp * 1000)))
        .attr('style', 'stroke:black;stroke-width:1;stroke-dasharray:5,5;');

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
      shift = this.yScale(this.maxMetricValue);
    }

    this.svg.selectAll()
      .data(this.annotations)
      .enter()
      .append('line')
        .attr('x1', shift + k * ANNOTATION_HELPER_PARAMS.lineX1)
        .attr('x2', shift + k * ANNOTATION_HELPER_PARAMS.lineX2)
        .attr('y1', (d: any) => this.xScale(new Date(d.timestamp * 1000)))
        .attr('y2', (d: any) => this.xScale(new Date(d.timestamp * 1000)))
        .attr('style', 'stroke:black;stroke-width:1;stroke-dasharray:5,5;')
        .on('mouseover', this.mouseOver)
        .on('mousemove', this.mouseMove)
        .on('mouseleave', this.mouseLeave);

    this.svg.selectAll()
      .data(this.annotations)
      .enter()
      .append('circle')
        .attr('cx', shift + k * ANNOTATION_HELPER_PARAMS.circleX)
        .attr('cy', (d: any) => this.xScale(new Date(d.timestamp * 1000)))
        .attr('r', 5 )
        .attr('style', 'stroke:black;stroke-width:1;fill:white;')
        .on('mouseover', this.mouseOver)
        .on('mousemove', this.mouseMove)
        .on('mouseleave', this.mouseLeave)
        .on('click', (d: any) => this.$emit('click', d));

    this.svg.selectAll()
      .data(this.annotations)
      .enter()
      .append('text')
        .attr('x', shift + k * ANNOTATION_HELPER_PARAMS.textX)
        .attr('y', (d: any) => this.xScale(new Date(d.timestamp * 1000)) + 3)
        .text(this.annotationLabel)
        .attr('font-size', '10px')
        .attr('font-weght', 'bold')
        .attr('cursor', 'default')
        .on('mouseover', this.mouseOver)
        .on('mousemove', this.mouseMove)
        .on('mouseleave', this.mouseLeave);
  }

  renderChart(): void {
    console.log('re-render');
    if(this.metricNames.length === 0) {
      throw new Error('There should be at least 1 metric');
    }

    this._createSvg();
    this._renderAxes();

    this.metricNames.forEach(this._renderMetric);
    this._renderAnnotations();
  }

  mouseOver(): void {
    this.$emit('tooltip', {
      displayed: true
    });
  }

  // TODO: not any
  mouseMove(d: any): void {
    this.$emit('tooltip', {
      displayed: true,
      x: d3.event.clientX - 125,
      y: d3.event.clientY - 60,
      content: d.text
    });
  }
  mouseLeave(): void {
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
