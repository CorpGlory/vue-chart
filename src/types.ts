export type Annotation = {
  timestamp: number,
  text: string
};

export enum AnnotationHelperPosition {
  LEFT = "left-side",
  RIGHT = "right-side",
  NONE = "none"
};
