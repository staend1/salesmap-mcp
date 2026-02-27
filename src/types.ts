export interface Env {
  SALESMAP_API_TOKEN: string;
}

export interface SalesMapResponse<T = unknown> {
  success: boolean;
  data?: T;
  message?: string;
  reason?: string;
}

export interface PaginatedData {
  nextCursor: string | null;
}

export interface FieldListItem {
  name: string;
  stringValue?: string;
  numberValue?: number;
  booleanValue?: boolean;
  dateValue?: string;
  stringValueList?: string[];
  userValueId?: string;
  userValueIdList?: string[];
  organizationValueId?: string;
  organizationValueIdList?: string[];
  peopleValueId?: string;
  peopleValueIdList?: string[];
  dealValueIdList?: string[];
  pipelineValueId?: string;
  pipelineStageValueId?: string;
  webformValueId?: string;
  sequenceValueId?: string;
  sequenceValueIdList?: string[];
}

export type EntityType = "people" | "organization" | "deal" | "lead" | "custom-object";
export type SearchTargetType = "people" | "organization" | "deal" | "lead";
export type FieldTargetType = "deal" | "lead" | "people" | "organization" | "product" | "quote" | "todo" | "custom-object";
export type PipelineEntityType = "deal" | "lead";
