enum JobStatus {
  INPROGRESS = 'STATUS_01_IN_PROGRESS',
  ON_HOLD = 'STATUS_02_ON_HOLD',
  REVIEW = 'STATUS_03_UNDER_REVIEW',
  APPROVED = 'STATUS_04_APPROVED',
  REJECTED = 'STATUS_05_REJECTED',
  EXPORTED = 'STATUS_06_EXPORTED',
  READY = 'STATUS_07_READY_FOR_DEPLOYMENT',
  DEPLOYED = 'STATUS_08_DEPLOYED',
}

interface CronJob {
  id: string;
  tenant_id: string;
  name: string;
  cron: string;
  iterations: number;
  status: JobStatus;
  comments: string | null;
}

interface PaginatedResult<T> {
  data: T[];
  total: number;
  offset: number;
  limit: number;
  pages?: number;
}

export { JobStatus, type CronJob, type PaginatedResult };
