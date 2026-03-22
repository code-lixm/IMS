export type ApiSuccess<T> = {
  success: true;
  data: T;
  error: null;
  meta: {
    requestId: string;
    timestamp: string;
  };
};

export type ApiFailure = {
  success: false;
  data: null;
  error: {
    code: string;
    message: string;
  };
  meta: {
    requestId: string;
    timestamp: string;
  };
};

export type ApiResponse<T> = ApiSuccess<T> | ApiFailure;
