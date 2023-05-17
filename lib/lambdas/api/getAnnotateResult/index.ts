export const handler = (event: any, context:any,callback:any)=>{
    //GET method doesnt have request body
    const params = JSON.parse(event.body);
    const res = {
        "statusCode": 200,
        "body": JSON.stringify({
            "message": "exec succeeded",
        })
    }
    callback(null, res);
};
