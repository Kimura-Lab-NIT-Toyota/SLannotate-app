FROM public.ecr.aws/lambda/python:3.10
RUN yum install git -y
COPY DLutil DLutil
COPY app.py ${LAMBDA_TASK_ROOT}
RUN  pip3 install -e DLutil --target "${LAMBDA_TASK_ROOT}"
CMD ["app.handler"]