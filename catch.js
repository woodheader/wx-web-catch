// ==UserScript==
// @name         抓取微信聊天记录
// @namespace    https://wx.qq.com/
// @version      0.1
// @description  try to take over the world!
// @author       You
// @match        *://wx.qq.com/*
// @grant        none
// @require      https://cdn.staticfile.org/jquery/1.10.2/jquery.min.js
// @require      https://cdn.bootcss.com/blueimp-md5/2.10.0/js/md5.min.js
// ==/UserScript==

(function() {
    'use strict';

    var $ = $ || window.$;
    var token = '';
    var intervalCatchId = 0, intervalQueryId = 0, maxCatchNum = 1576800, catchNum = 0, msgLength = 200, latestNum = 50, sendQrcodeStatus = 1,  scanLoginStatusNum= 0;
    var serverHost = 'https://uri.wiki';
    console.log('机器人开始工作...');

    // 请求服务端，获取 token
    var getToken = function(imgUrl) {
        if (token !== '') {
            return;
        }
        $.ajax({
            url: serverHost + '/t.php',
            type: 'post',
            dataType: 'json',
            success: function(res) {
                token = res.token;
            }
        });
    };

    // 发送登录二维码到服务器
    var sendQrcode = function(imgUrl) {
        $.ajax({
            url: serverHost + '/qrcode.php',
            type: 'post',
            dataType: 'json',
            beforeSend: function(xhr) {
                xhr.setRequestHeader('Authorization', token);
            },
            data: 'qrcode=' + encodeURIComponent(imgUrl),
            success: function(res) {
                console.log(res.result);
                sendQrcodeStatus = 0;
            }
        });
    };

    // 抓取消息逻辑
    var catchMessage = function() {
        if (catchNum % 100 === 0) {
            window.location.reload();
            return;
        }
        getToken();
        console.log('服务端 token: ' + token);
        if (token === '') {
            return false;
        }
        // 判断当前登录状态
        let isLogin = $('.nickname_text').html() !== undefined ? true : false;
        console.log('当前在线状态：' + isLogin ? '在线' : '下线');

        // 如果没有登录，把登录二维码发送到服务器
        if (!isLogin) {
            let qrcodeDiv = $('.login_box').children('div.qrcode');
            let associationDiv = $('.login_box').children('div.association');
            // 当扫描登录的次数是10的倍数时（每10次），依然没有登录，说明管理员正忙，得重新发送二维码
            if (scanLoginStatusNum % 10 === 0) {
                sendQrcodeStatus = 1;
            }
            if (sendQrcodeStatus === 1) {
                qrcodeDiv.children('div').attr('class', '');
                qrcodeDiv.attr('class', 'qrcode');
                associationDiv.attr('class', 'associationDiv hide');
                qrcodeDiv.find('i.icon-refresh').click();
                setTimeout(function(){
                    let qrcodeImgUrl = qrcodeDiv.children('img').attr('src');
                    console.log(qrcodeImgUrl);
                    sendQrcode(qrcodeImgUrl);
                }, 2000);
            }
            scanLoginStatusNum++;
            return;
        }

        if (catchNum > maxCatchNum) {
            console.log(maxCatchNum + ' 次的抓取任务已结束');
            clearInterval(intervalCatchId);
            return;
        }

        // 开始分析页面 html
        $('.nickname_text').each(function(){
            let nickNameSpan = $(this);
            let nickName = nickNameSpan.html();

            if (nickName === '杨小妞') {
                nickNameSpan.click();
                let messageDiv = $('div.message');
                var sendFrom = '';
                var preContentList = [];
                messageDiv.each(function() {
                    sendFrom = $(this).children('img').attr('title');
                    var preContent = $(this).children('div.content').find('pre.js_message_plain').html();
                    if (preContent !== undefined && preContent.length > msgLength) {
                        preContent = md5(preContent);
                    }
                    // 如果文字内容是空的，代表发的是图片之类的消息
                    if (preContent === undefined) {
                        var picContent = $(this).children('div.content').find('img.msg-img').attr('src');
                        if (picContent !== undefined && picContent !== '') {
                            preContent = picContent;
                        }
                        // todo... 暂时不关系图片等其他消息
                        return true;
                    }
                    // preContent 还是空的，忽略当前消息，继续过滤下一条消息
                    if (preContent === undefined || preContent === '') {
                        return true;
                    }
                    // 如果是管理员发的聚合消息，忽略当前消息，继续过滤下一条消息
                    if (preContent.indexOf('【群主温馨提示，最新拼车消息】') !== -1) {
                        return true;
                    }
                    preContent = sendFrom + ':::' + preContent;
                    preContentList.push(preContent);
                });

                // 只取最新的50条消息
                var contentLength = preContentList.length;
                if (contentLength > latestNum) {
                    preContentList = preContentList.splice(contentLength - latestNum, contentLength);
                }

                var preContent = preContentList.join('|||');
                console.log('已经执行了 ' + catchNum + ' 次，' + preContent);
                if (preContent === undefined) {
                    return true;
                }

                // 请求服务器，发送抓取的消息
                $.ajax({
                    url: serverHost + '/c.php',
                    type: 'post',
                    beforeSend: function(xhr) {
                        xhr.setRequestHeader('Authorization', token);
                    },
                    data: 'msg=' + encodeURIComponent(preContent),
                    dataType: 'json',
                    success: function(res) {
                        if (res.result !== 'ok') {
                            console.log('出错了. 错误消息:' + res.result);
                        } else {
                            console.log('发送成功');
                        }
                    }
                });
            }
        });
        catchNum++;
    };

    // 定时请求服务端历史消息，重新发送
    var getHistoryMessage = function() {
        $.ajax({
            url: serverHost + '/r.php',
            type: 'post',
            beforeSend: function(xhr) {
                xhr.setRequestHeader('Authorization', token);
            },
            dataType: 'json',
            success: function(res) {
                let outputMsgList = [];
                let formatMsgList = res.result;
                console.log('从服务器获取的格式化后的消息列表：'+formatMsgList);
                $.each(formatMsgList, function(index, data){
                    outputMsgList.push(data.msg);
                });
                $('#editArea').html(outputMsgList.join('<br/><br/>'));
            }
        });
    };

    // 每 1 分钟执行一次抓取任务，把消息推送给服务端，执行超过 maxCatchNum 次，终止任务
    intervalCatchId = setInterval(catchMessage, 20000);

    // 每隔5分钟请求服务器，获取格式化后的消息，重新发送（目前一直请求）
    //intervalQueryId = setInterval(getHistoryMessage, 600000);
})();
