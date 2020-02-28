export type Annotation = {
  date: Date,
  text: string
};

export enum AnnotationHelperPosition {
  LEFT = "left-side",
  RIGHT = "right-side",
  NONE = "none"
};

export type ZoomLimits = {
  max: number,
  min: number,
  zoomOut: number
};
