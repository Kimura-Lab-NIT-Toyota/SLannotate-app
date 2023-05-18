import { type } from "os";

export const handler = (event: any, context: any, callback: any) => {
    const params = event.pathParameters as Params;
    let statusCode = 200;
    let body = "";
    if (!params.userId || !params.fileName) {
        callback(null, {
            "statusCode": 400,
            "body": JSON.stringify({
                "message": "userId and fileName are required",
            })
        });
    } else {
        //TODO:annotate
        body = JSON.stringify({
            "message": `got ${params}`,
        })
    }
    const res = {
        "statusCode": statusCode,
        "body": body,
    }
    callback(null, res);
};

type Params = {
    userId: string,
    fileName: string,
}