export type Annotation = {
  date: Date,
  text: string
};

export enum AnnotationHelperPosition {
  LEFT = "left-side",
  RIGHT = "right-side",
  NONE = "none"
};

export type Timestamp = number;

export type ZoomLimits = {
  max: Timestamp,
  min: Timestamp,
};

export enum AxisType {
  NUMERIC = 'numeric',
  TIME = 'time'
};

export enum RenderType {
  LINE = 'line',
  POINT = 'point'
}
