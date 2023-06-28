FROM public.ecr.aws/lambda/python:3.10
RUN yum install git -y
COPY app.py ./
COPY models models
COPY DLutil DLutil
RUN  pip3 install -e DLutil --target "${LAMBDA_TASK_ROOT}"
# 上記コマンドでDLutilの依存する外部パッケージはインストールされるが、DLutil本体はなぜか参照できない
# そのためパッケージのインストール先に直接配置する
COPY DLutil /var/lang/lib/python3.10/site-packages/
CMD ["app.handler"]