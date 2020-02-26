import * as d3 from 'd3';
import _ from 'lodash';


type DateLike = Date | number | { valueOf(): number };

const formatMillisecond = d3.timeFormat('%d %b %H:%M:%S.%L');
const formatSecond = d3.timeFormat('%d %b %H:%M:%S');
const formatMinute = d3.timeFormat('%d %b %H:%M');
const formatHour = d3.timeFormat('%d %b %H:%M');
const formatDay = d3.timeFormat('%d %b');
const formatWeek = d3.timeFormat('%d %b');
const formatMonth = d3.timeFormat('%d %B');
const formatYear = d3.timeFormat('%Y');

function fromDateLikeToDate(d: DateLike): Date {
  if(d instanceof Date) {
    return d;
  }
  if(typeof d === 'number') {
    return new Date(d);
  }
  return new Date(d.valueOf());
}

export function formatTimeTicks(d: DateLike): string {
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

export function findMaxMetricValue(values: number[][], columnIndex: number): number {
  const maxRow = _.maxBy(values, (x: number[]) => x[columnIndex]);
  if(maxRow === undefined) {
    return 0;
  }
  return maxRow[columnIndex];
}
