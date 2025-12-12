export interface Task {
  id: string;
  content: string;
  createdAt: Date;
  metadata?: Record<string, unknown>;
}

export interface TaskResult {
  taskId: string;
  agentName: string;
  success: boolean;
  response?: string;
  error?: string;
  startTime: Date;
  endTime: Date;
  duration: number;
}

export interface OrchestrationResult {
  responses: Map<string, any>;
  errors: Map<string, any>;
  timing: {
    totalDuration: number;
    fastestAgent?: string;
    fastestTime?: number;
  };
  costs: {
    total: number;
    byAgent: Map<string, number>;
    cheapestAgent?: string;
  };
}
