// TODO: it's not the best timeseries type
export type TimeSeries = {
  columns: string[],
  values: number[][],
  colors: string[]
};

export type Annotation = {
  timestamp: number,
  text: string
};

export enum AnnotationHelperPosition {
  LEFT = "left-side",
  RIGHT = "right-side",
  NONE = "none"
};
