export interface Entity {
  id: string;
  name: string;
  type: string; // e.g., "Method", "Metric", "Task"
  description?: string;
  metadata?: Record<string, any>;
}

export interface Relationship {
  sourceId: string; // Refers to Entity.id
  targetId: string; // Refers to Entity.id
  type: string; // e.g., "improves_on", "uses", "evaluated_on"
  description?: string;
  metadata?: Record<string, any>;
}

export interface GraphData {
  entities: Entity[];
  relationships: Relationship[];
  referencedEntityIds?: string[]; // IDs of entities in DB referenced by relationships but not in entities array
}

export interface IPipelineStep<TInput, TOutput> {
  name: string;
  process(input: TInput): Promise<TOutput>;
}

export interface IExtractor extends IPipelineStep<string, GraphData> { }
export interface IDefiner extends IPipelineStep<GraphData, GraphData> {
  consolidateSchema(graph: GraphData): Promise<void>;
}
export interface ICanonicalizer extends IPipelineStep<GraphData, GraphData> {
  resolveEntities(nodes: Entity[]): Promise<Entity[]>;
}
