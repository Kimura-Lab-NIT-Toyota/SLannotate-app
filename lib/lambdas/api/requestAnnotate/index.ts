import { type } from "os";

export const handler = (event: any, context: any, callback: any) => {
    const params: Params = JSON.parse(event.body);
    let statusCode = 200;
    let body = "";
    if (!params.targetId){
        callback(null, {
            "statusCode": 400,
            "body": JSON.stringify({
                "message": "targetId is required",
            })
        });
        return;
    }else{
        //TODO:annotate
        body = JSON.stringify({
            "message": `got ${params.targetId}`,
        })
    }
    const res = {
        "statusCode": statusCode,
        "body": body,
    }
    callback(null, res);
};

type Params = {
    targetId: string;
}