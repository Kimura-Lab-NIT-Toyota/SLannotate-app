FROM public.ecr.aws/lambda/python:3.10
RUN yum install git -y
# ./modelsとかにすると原因不明のエラーが出る。
COPY DLutil DLutil
RUN  pip3 install -e DLutil --target "${LAMBDA_TASK_ROOT}"
# 上記コマンドでDLutilの依存する外部パッケージはインストールされるが、DLutil本体はなぜか参照できない
# そのためパッケージのインストール先に直接配置する
COPY DLutil /var/lang/lib/python3.10/site-packages/
COPY models models
COPY app.py ./
# NOTE:
# RUNはそれ以前の行に変更がないならキャッシュを使ってくれる。
# COPY app.pyをパッケージのインストールより後に置くことで、app.pyの変更時にパッケージレイヤーのキャッシュが効き、大幅にビルドが高速化できる。
CMD ["app.handler"]