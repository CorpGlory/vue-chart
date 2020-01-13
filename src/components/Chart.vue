<template>
<div class="chart">
  <h5>{{ title }}</h5>
  <div class="chart-container">
    <svg width="100%" height="100%"> </svg>
  </div>
</div>
</template>

<script lang="ts">

import { Component, Vue, Prop, Watch } from 'vue-property-decorator';

import * as d3 from 'd3';
import _ from 'lodash';

const formatMillisecond = d3.timeFormat('.%L');
const formatSecond = d3.timeFormat(':%S');
const formatMinute = d3.timeFormat('%H:%M');
const formatHour = d3.timeFormat('%H:00');
const formatDay = d3.timeFormat('%d %b');
const formatWeek = d3.timeFormat('%b %d');
const formatMonth = d3.timeFormat('%B');
const formatYear = d3.timeFormat('%Y');

export type DateLike = Date | number | { valueOf(): number }


function fromDateLikeToDate(d: DateLike): Date {
  if(d instanceof Date) {
    return d;
  }
  if(typeof d === 'number') {
    return new Date(d);
  }
  return new Date(d.valueOf());
}


function tickFormat(d: DateLike): string {

  let date: Date = fromDateLikeToDate(d);

  return (d3.timeSecond(date) < date ? formatMillisecond
    : d3.timeMinute(date) < date ? formatSecond
    : d3.timeHour(date) < date ? formatMinute
    : d3.timeDay(date) < date ? formatHour
    : d3.timeMonth(date) < date ? (d3.timeWeek(date) < date ? formatDay : formatWeek)
    : d3.timeYear(date) < date ? formatMonth
    : formatYear
  )(date);
}


function findMaxMetricValue(values: number[][], columnIndex: number): number {
  const maxRow = _.maxBy(values, (x: any[]) => x[columnIndex]);
  if(maxRow === undefined) {
    return 0;
  }
  return maxRow[columnIndex];
}

function makeSeriesStacked(series: any[]): any[] {
  series
    .forEach(value => {
      value[1] = value[1] * 100;
      for (let i = 2; i < value.length; i++) {
        value[i] = value[i] * 100;
        value[i] = value[i] + value[i - 1];
      }
    });
  return series;
}

function tickPercentFormat(d: any): string {
  return d + ' %';
}

const COLORS_PALETTE = ['red', 'blue'];

export enum Axis {
  LEFT, RIGHT, NONE
}

export type Serie = {
  columns: string[],
  name: string,
  tags: {
    server: string
  },
  values: any[]
}


@Component
export default class MyChart extends Vue {

  d3Node: any;
  // TODO: count margins
  margin = { top: 20, right: 110, bottom: 100, left: 90 };

  @Prop({ required: true })
  timeSeries!: {
    columns: string[],
    values: number[][]
  };

  @Prop({ required: true })
  title: string;

  @Prop({ required: false })
  yAxisLabel!: string;

  @Prop({ required: true })
  twoYAxes!: boolean;

  @Prop({ required: true })
  stacked!: boolean;

  @Prop({ required: true })
  percented!: boolean;

  @Prop({ required: false })
  maxValue!: number;

  @Watch('timeSeries')
  onTimeSeriesChange() {
    console.log('timeSeries change');
    this.renderChart();
  }

  get metrics(): string[] {
    return this.timeSeries.columns.slice(1);
  }

  get width(): number {
    const svgContainer: any = this.d3Node.select('.chart-container');
    return svgContainer.node().clientWidth - this.margin.left - this.margin.right;
  }

  get height(): number {
    const svgContainer: any = this.d3Node.select('.chart-container');
    return svgContainer.node().clientHeight - this.margin.top - this.margin.bottom;
  }

  get legendSpace(): number {
    return this.width / (3 * this.metrics.length);
  }

  getAxisByIndex(index: number): Axis {
    if(this.twoYAxes && index === 1) {
      return Axis.RIGHT;
    }
    if(index === 0) {
      return Axis.LEFT;
    }
    return Axis.NONE;
  }

  renderChart() {
    // TODO: split rendering
    let values = this.timeSeries.values.map((value: any[]) => {
      return value.map(val => {
        if(_.isString(val)) {
          return d3.isoParse(val);
        }
        return val;
      });
    });

    if(this.stacked === true) {
      values = makeSeriesStacked(values);
    }

    this.d3Node.selectAll('svg *').remove();

    const svg = this.d3Node
      .select('svg')
      .append('g')
        .attr('transform', `translate(${this.margin.left},${this.margin.top})`);

    const xScale = d3.scaleTime()
      .domain([values[0][0], values[values.length - 1][0]])
      .range([0, this.width]);

    if(this.metrics.length === 0) {
      throw new Error('There should be at least 1 metric');
    }

    let maxValue = this.maxValue;
    if(maxValue === undefined) {
      if(this.twoYAxes) {
        maxValue = findMaxMetricValue(values, 1);
      } else {
        const maxMetricValue = _.max(
          this.metrics.map(
            (metric: string, idx: number) => findMaxMetricValue(values, idx + 1)
          )
        );
        if(maxMetricValue !== undefined) {
          maxValue = maxMetricValue;
        }
      }
    }
    this.metrics.forEach((metric: string, idx: number) => {
      let yScale = d3.scaleLinear()
        .domain([0, maxValue])
        .range([this.height, 0]);

      if(this.getAxisByIndex(idx) === Axis.RIGHT) {
        const maxValue = findMaxMetricValue(values, idx + 1);
        yScale = d3.scaleLinear()
          .domain([0, maxValue])
          .range([this.height, 0]);
      }

      const legendSpace = (this.width / 2) / this.metrics.length;

      let rows = 1;
      if(this.metrics.length > 2) {
        rows = Math.ceil(this.metrics.length / 3);
      }
      // TODO: move all appends to template
      const textIndentY = 40;
      const circleIndentY = 35;
      const indentX = 100;
      const rowIndent = 20;
      const columnIndent = 5;

      svg.append('text')
        .attr('x', (idx % 3) * indentX + columnIndent)
        .attr('y', this.height + textIndentY + rowIndent * Math.floor(idx / 3))
        .attr('class', 'legend')
        .attr('font-size', '10pt')
        .text(metric);

      svg.append('circle')
        .attr('cx', (idx % 3) * indentX)
        .attr('cy', this.height + circleIndentY + rowIndent * Math.floor(idx / 3))
        .attr('r', 2)
        .style('fill', COLORS_PALETTE[idx]);

      const lineGenerator = d3.line()
        .x(d => xScale(d[0]))
        .y(d => yScale(d[idx + 1]))
        .curve(d3.curveMonotoneX);

      svg.append('g')
        .attr('class', 'x axis')
        .attr('transform', `translate(0,${this.height})`)
        .call(d3.axisBottom(xScale).tickFormat(tickFormat));

      if(this.getAxisByIndex(idx) === Axis.LEFT) {
        let axisLeft = d3.axisLeft(yScale);
        const label = this.yAxisLabel !== undefined ? this.yAxisLabel : metric;

        if(this.percented === true) {
          axisLeft = d3.axisLeft(yScale).tickFormat(tickPercentFormat)
        }
        svg.append('g')
          .attr('class', `y${idx} axis`)
          .call(axisLeft);

        svg.append('text')
          .attr('transform', 'rotate(-90)')
          .attr('y', 0 - this.margin.left)
          .attr('x', 0 - (this.height / 2))
          .attr('dy', '1em')
          .attr('font-size', '12pt')
          .style('text-anchor', 'middle')
          .text(label);
      }

      if(this.getAxisByIndex(idx) === Axis.RIGHT) {
        svg.append('g')
          .attr('class', `y${idx} axis`)
          .attr('transform', `translate(${this.width},0)`)
          .call(d3.axisRight(yScale));

        svg.append('text')
          .attr('transform', `translate(${this.width + this.margin.right / 4},${this.height / 2}),rotate(-90)`)
          .attr('dy', '1em')
          .style('text-anchor', 'middle')
          .attr('font-size', '12pt')
          .text(metric);
      }

      svg.append('path')
        .datum(values)
        .attr('fill', 'none')
        .attr('stroke', COLORS_PALETTE[idx])
        .attr('stroke-width', 1)
        .attr('d', lineGenerator);

      svg.selectAll(`.dot${idx + 1}`)
        .data(values.map(value => ({
          time: value[0],
          value: value[idx + 1],
          name: metric
        })))
        .enter()
        .append('circle')
          .attr('fill', COLORS_PALETTE[idx])
          .attr('cx', (d: any) => xScale(d.time))
          .attr('cy', (d: any) => yScale(d.value))
          .attr('r', 2)
    });
  }

  mounted() {
    this.d3Node = d3.select(this.$el);

    this.onTimeSeriesChange();
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
