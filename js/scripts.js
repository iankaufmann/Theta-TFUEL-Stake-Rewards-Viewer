/** -------------------------------------------------------------- //

Theta / TFUEL Stake Rewards Viewer
--

Author: Ian Kaufmann

*/

let APP = function() {

    let APP = this;

    /** -------------------------------------------------------------- //
    
    Config
    
    */

    APP.config = {
        "address": null,
        "allow_api_call": true,
        "csv": {
            "header": ["Timestamp (UTC)", "Type", "Base Currency", "Base Amount", "Quote Currency", "Quote Amount", "Fee Currency (Optional)", "Fee Amount (Optional)"],
            "data": []
        },
        "nodes": {
            "buttons": {
                "start": document.getElementById('button-start'),
                "csv": document.getElementById('button-csv')
            },
            "inputs": {
                "address": document.getElementById('input-address')
            },
            "sections": {
                "intro": document.getElementById('section-intro'),
                "running": document.getElementById('section-running'),
                "report": document.getElementById('section-report'),
            },
            "messages": {
                "running": document.getElementById('message-running')
            },
            "errors": document.getElementById('errors')
        },
        "modals": {
            "errors": null
        },
        "urls": {
            "explorer": "https://explorer.thetatoken.org:8443/api",
            "thetascan": "https://www.thetascan.io/api"
        },
        "types": {
            "history": {
                "api": "explorer",
                "method": "accounttx",
                "transform_url": function(url, api) {
                    return url + '/' + APP.config.address
                },
                "params": {
                    "type": 0,
                    "pageNumber": 1,
                    "limitNumber": 100,
                    "isEqualType": true
                },
                "recursions": 0,
                "response": function(response, req, api, type, callbacks = {}, params = {}, recursive_data = {}) {

                    if(typeof(recursive_data.rewards) == "undefined") {
                        recursive_data.rewards = [];
                    }

                    response.totalPageNumber = parseInt(response.totalPageNumber);
                    response.currentPageNumber = parseInt(response.currentPageNumber);

                    if(response.totalPageNumber > 0) {

                        let message = "Requested explorer API data (Page " + response.currentPageNumber + ' of ' + response.totalPageNumber + ")";

                        if(req.getResponseHeader("Content-Length")) {
                            message += ' (' + (parseInt(req.getResponseHeader("Content-Length")) / 1048576.0) + 'MB)';
                        }

                        APP.message(message);

                    }

                    response.body.forEach(function(transaction, transaction_index) {

                        transaction.data.outputs.forEach(function(output, output_index) {

                            if(output.address == APP.config.address) {

                                let timestamp_utc = new Date(0);
                                    timestamp_utc.setUTCSeconds(parseInt(transaction.timestamp));

                                recursive_data.rewards.push({
                                    "from": output.address.toLowerCase(),
                                    "tfuel": parseFloat(output.coins.tfuelwei) * 0.000000000000000001,
                                    "price": "",
                                    "amount": "",
                                    "timestamp": parseInt(transaction.timestamp),
                                    "timestamp_utc": timestamp_utc.toUTCString(),
                                    "timestamp_iso": timestamp_utc.toISOString()
                                });

                            }

                        });

                    });

                    callbacks.onRequestComplete({
                        api: api,
                        type: type,
                        params: params,
                        recursive_data: recursive_data,
                        req: req
                    });

                    if(response.totalPageNumber > response.currentPageNumber) {

                        api.recursions++;

                        params.pageNumber = response.currentPageNumber + 1;

                        APP.api(type, callbacks, params, recursive_data);

                    } else {

                        if(recursive_data.rewards.length === 0) {
                            APP.fail("There are no stake rewards found for this address!");
                            return;
                        }

                        // These are intentionally reversed.
                        // We need them backwards for the call to the price API
                        let first_reward = recursive_data.rewards[recursive_data.rewards.length - 1],
                            last_reward = recursive_data.rewards[0];

                        let first_reward_timestamp_utc = new Date(0);
                            first_reward_timestamp_utc.setUTCSeconds(parseInt(first_reward.timestamp));

                        let last_reward_timestamp_utc = new Date(0);
                            last_reward_timestamp_utc.setUTCSeconds(parseInt(last_reward.timestamp));

                        let first_reward_ymd = first_reward_timestamp_utc.toISOString().split("T")[0],
                            last_reward_ymd = last_reward_timestamp_utc.toISOString().split("T")[0];

                        APP.message("Fetching current staked balances");

                        new APP.api("balance", {
                            onAllComplete: function(balance_data) {

                                recursive_data["balance"] = balance_data.recursive_data.balance;

                                APP.message("Fetching current price");

                                new APP.api("price", {
                                    onAllComplete: function(current_price_data) {

                                        let current_price = {},
                                            current_price_date_obj = new Date(current_price_data.recursive_data.prices.date);

                                        current_price_date_obj.setDate(current_price_date_obj.getDate() + 1);
                                        tomorrow_date_ymd = current_price_date_obj.toISOString().split("T")[0];

                                        current_price[tomorrow_date_ymd] = {
                                            theta_price: current_price_data.recursive_data.prices.theta_price,
                                            tfuel_price: current_price_data.recursive_data.prices.tfuel_price
                                        };

                                        current_price[current_price_data.recursive_data.prices.date] = {
                                            theta_price: current_price_data.recursive_data.prices.theta_price,
                                            tfuel_price: current_price_data.recursive_data.prices.tfuel_price
                                        };

                                        recursive_data["current_price"] = current_price_data.recursive_data.prices.tfuel_price;

                                        APP.message("Fetching prices from: " + first_reward_ymd + " to: " + last_reward_ymd);

                                        new APP.api("price", {
                                            onAllComplete: function(historical_price_data) {

                                                let prices = historical_price_data.recursive_data.prices;
                                                    prices = Object.assign(current_price, prices);

                                                recursive_data.rewards.forEach(function(reward, reward_index) {

                                                    let reward_timestamp_ymd = reward.timestamp_iso.split("T")[0];

                                                    if(typeof(prices[reward_timestamp_ymd]) != "undefined") {
                                                        reward.price = parseFloat(prices[reward_timestamp_ymd]["tfuel_price"]);
                                                        reward.amount = reward.price * parseFloat(reward.tfuel);
                                                    }

                                                });

                                                callbacks.onAllComplete({
                                                    api: api,
                                                    type: type,
                                                    params: params,
                                                    recursive_data: recursive_data,
                                                    req: req
                                                });

                                                APP.message("", false);

                                            }
                                        }, {
                                            start_date: first_reward_ymd,
                                            end_date: last_reward_ymd
                                        });

                                    }

                                });

                            }
                        });

                    }

                }
            },
            "balance": {
                "api": "explorer",
                "method": "stake",
                "transform_url": function(url, api) {
                    return url + '/' + APP.config.address + '?types[]=vcp&types[]=gcp&types[]=eenp';
                },
                "params": {},
                "response": function(response, req, api, type, callbacks = {}, params = {}, recursive_data = {}) {

                    if(typeof(recursive_data.balance) == "undefined") {
                        recursive_data.balance = {
                            "theta": 0,
                            "tfuel": 0
                        }
                    };

                    response.body.sourceRecords.forEach(function(record, index) {

                        recursive_data.balance[record.type == "gcp" ? "theta" : "tfuel"] += parseFloat(record.amount * 0.000000000000000001);

                    });

                    callbacks.onRequestComplete({
                        api: api,
                        type: type,
                        params: params,
                        recursive_data: recursive_data,
                        req: req
                    });

                    callbacks.onAllComplete({
                        api: api,
                        type: type,
                        params: params,
                        recursive_data: recursive_data,
                        req: req
                    });


                }
            },
            "price": {
                "api": "thetascan",
                "method": "price",
                "transform_url": function(url, api) {
                    if(url.slice(-6) == "/price") {
                        return url + '/';
                    }
                    return url;
                },
                "params": {},
                "response": function(response, req, api, type, callbacks = {}, params = {}, recursive_data = {}) {

                    if(typeof(recursive_data.prices) == "undefined") {
                        recursive_data.prices = [];
                    }

                    if(response) {
                        recursive_data.prices = response;
                    }

                    callbacks.onRequestComplete({
                        api: api,
                        type: type,
                        params: params,
                        recursive_data: recursive_data,
                        req: req
                    });

                    callbacks.onAllComplete({
                        api: api,
                        type: type,
                        params: params,
                        recursive_data: recursive_data,
                        req: req
                    });

                }
            }
        }
    };

    /** -------------------------------------------------------------- //
    
    On Failure
    
    */

    APP.fail = function(error, data = '') {

        console.error(error, data);

        let alert = '<p>' + error + '</p>';

        try {

            if(data.exception.message) {
                alert += '<p>' + data.exception.message + '</p>';
            }

        } catch(e) {}

        APP.config.nodes.errors.querySelector('.modal-body').innerHTML = alert;
        APP.config.modals.errors.show();

        APP.config.allow_api_call = false;

        document.querySelectorAll('section').forEach(function(element, i) {
            element.style.display = 'none';
        });
        APP.config.nodes.sections.intro.style.display = 'block';

    }

    /** -------------------------------------------------------------- //
    
    Status Messages
    
    */

    APP.message = function(message = "", append = true) {

        if(message) { console.info(message); }

        message = '<div class="message">' + message + '</div>';

        if(append) {

            APP.config.nodes.messages.running.innerHTML = APP.config.nodes.messages.running.innerHTML + message;

        } else {

            APP.config.nodes.messages.running.innerHTML = message;

        }

    }

    /** -------------------------------------------------------------- //
    
    Get API Config
    
    */

    APP.getAPI = function(type, params = {}) {

        if(typeof(APP.config.types[type]) == "undefined") {
            APP.fail("Invalid type: " + type);
            return false;
        }

        let api = Object.assign({}, APP.config.types[type]);

        if(typeof(APP.config.urls[api.api]) == "undefined") {
            APP.fail("Invalid API: " + api.api);
            return false;
        }

        api.params = new URLSearchParams(api.params);

        api.url = APP.config.urls[api.api];

        for(const [key, value] of Object.entries(params)) {
            api.params.set(key, value)
        }

        api.url += '/' + api.method;

        if(typeof(api.transform_url) == "function") {
            let pre_transformed_url = api.url;
            api.url = api.transform_url(pre_transformed_url, api);
        }
        
        if(Array.from(api.params).length > 0) {
            api.url += '?' + api.params.toString();
        }

        return api;

    }

    /** -------------------------------------------------------------- //
    
    API Call
    
    */

    APP.api = function(type, callbacks = {}, params = {}, recursive_data = {}) {

        if(!APP.config.allow_api_call) { return false; }

        let api = APP.getAPI(type, params);

        if(!api) { return false; }

        if(typeof(callbacks.onError) != "function") {
            callbacks.onError = function() {};
        }

        if(typeof(callbacks.onRequestComplete) != "function") {
            callbacks.onRequestComplete = function() {};
        }

        if(typeof(callbacks.onAllComplete) != "function") {
            callbacks.onAllComplete = function() {};
        }

        let req = new XMLHttpRequest();

        req.open('GET', api.url, true);
        req.send();

        req.onreadystatechange = function() {

            if(req.readyState === XMLHttpRequest.DONE) {

                if(req.status === 200) {

                    try {
                    
                        let response = JSON.parse(req.responseText);

                        api.response(response, req, api, type, callbacks, params, recursive_data);

                    } catch(e) {

                        callbacks.onError('exception', {
                            exception: e,
                            api: api,
                            type: type,
                            params: params,
                            recursive_data: recursive_data,
                            req: req
                        });

                        APP.fail("Ajax parse error: ", {
                            exception: e,
                            api: api,
                            type: type,
                            params: params,
                            recursive_data: recursive_data,
                            req: req
                        });

                    }

                } else {

                    callbacks.onError('api', {
                        api: api,
                        type: type,
                        params: params,
                        recursive_data: recursive_data,
                        req: req
                    });

                    APP.fail("Ajax error: ", {
                        api: api,
                        type: type,
                        params: params,
                        recursive_data: recursive_data,
                        req: req
                    });

                }

            }
            
        };

    };

    /** -------------------------------------------------------------- //
    
    Events
    
    */

    APP.events = {

        /** -------------------------------------------------------------- //
        
        Address Change
        
        */

        "address_change": function() {

            APP.config.address = APP.config.nodes.inputs.address.value;

            let searchParams = new URLSearchParams(window.location.search);

            if(!searchParams.get("address") || searchParams.get("address") != APP.config.address) {

                searchParams.set("address", APP.config.address);
                history.pushState(null, '', window.location.pathname + '?' + searchParams.toString());

            }

        },

        /** -------------------------------------------------------------- //
        
        Start
        
        */

        "start": function() {

            if(!APP.config.address) {

                alert("Must enter a wallet address!");
                return false;

            }

            APP.config.allow_api_call = true;
            APP.config.csv.data = [];

            document.querySelectorAll('section').forEach(function(element, i) {
                element.style.display = 'none';
            });
            APP.config.nodes.sections.running.style.display = 'block';

            APP.config.nodes.inputs.address.disabled = true;
            APP.config.nodes.buttons.start.disabled = true;

            new APP.api("history", {
                onError: function(type, data) {
                    console.error('onError', type, data);
                },
                onAllComplete: function(data) {

                    /** -------------------------------------------------------------- //
                    
                    Set Staked Balances
                    
                    */

                    document.querySelector('[data-value="staked-theta"]').innerHTML = data.recursive_data.balance.theta;
                    document.querySelector('[data-value="staked-tfuel"]').innerHTML = data.recursive_data.balance.tfuel;

                    /** -------------------------------------------------------------- //
                    
                    Set Current Price
                    
                    */

                    document.querySelector('[data-value="total-current-price"]').innerHTML = data.recursive_data.current_price;

                    /** -------------------------------------------------------------- //
                    
                    Set Rewards Table
                    
                    */

                    let table_html = '',
                        tfuel_earned = 0,
                        cost_basis = 0;

                    data.recursive_data.rewards.forEach(function(reward, index) {

                        tfuel_earned += parseFloat(reward["tfuel"]);
                        cost_basis += parseFloat(reward["price"]) * parseFloat(reward["tfuel"]);

                        table_html += '<tr>';
                            table_html += '<td scope="row" data-key="tfuel">' + reward["tfuel"] + ' TFUEL</td>';
                            table_html += '<td data-key="price">$' + reward["price"] + '</td>';
                            table_html += '<td data-key="amount">$' + reward["amount"] + '</td>';
                            table_html += '<td data-key="timestamp">' + reward["timestamp_utc"] + '</td>';
                        table_html += '</tr>';

                        let csv_timestamp_split = reward["timestamp_iso"].split("T"),
                            csv_timestamp = csv_timestamp_split[0];

                        let csv_timestamp_time_split = csv_timestamp_split[1].split(".");

                        csv_timestamp = csv_timestamp + ' ' + csv_timestamp_time_split[0];

                        APP.config.csv.data.push([csv_timestamp, "income", "USD", "0", "TFUEL", reward["tfuel"], "", ""]);

                    });

                    let table = APP.config.nodes.sections.report.querySelector('#table-rewards tbody');

                    table.innerHTML = table_html;

                    /** -------------------------------------------------------------- //
                    
                    Set TFUEL Earned
                    
                    */

                    document.querySelector('[data-value="total-tfuel-earned"]').innerHTML = tfuel_earned;

                    /** -------------------------------------------------------------- //
                    
                    Set Cost Basis
                    
                    */

                    document.querySelector('[data-value="total-cost-basis"]').innerHTML = cost_basis;

                    /** -------------------------------------------------------------- //
                    
                    Set Current Value
                    
                    */

                    let current_value = tfuel_earned * data.recursive_data.current_price;

                    document.querySelector('[data-value="total-current-value"]').innerHTML = current_value;

                    /** -------------------------------------------------------------- //
                    
                    Re-Enable UI
                    
                    */

                    APP.config.nodes.inputs.address.disabled = false;
                    APP.config.nodes.buttons.start.disabled = false;

                    /** -------------------------------------------------------------- //
                    
                    Show Report
                    
                    */

                    document.querySelectorAll('section').forEach(function(element, i) {
                        element.style.display = 'none';
                    });

                    APP.config.nodes.sections.report.style.display = 'block';

                }
            });

        },

        /** -------------------------------------------------------------- //
        
        CSV
        ---

        https://stackoverflow.com/questions/14964035/how-to-export-javascript-array-info-to-csv-on-client-side
        
        */

        "csv": function() {

            let mime_type = 'text/csv;encoding:utf-8',
                file_name = 'csv.csv';

            let csv_data = [],
                csv_string = '';

            csv_data = csv_data.concat([APP.config.csv.header]);
            csv_data = csv_data.concat(APP.config.csv.data);

            csv_data.forEach(function(row, row_index) {
                row_string = row.join(',');
                csv_string += row_index < csv_data.length ? row_string + '\n' : row_string;
            });

            let a = document.createElement('a');

            if (navigator.msSaveBlob) { // IE10
                navigator.msSaveBlob(new Blob([csv_string], {
                type: mime_type
                }), file_name);
            } else if (URL && 'download' in a) { //html5 A[download]
                a.href = URL.createObjectURL(new Blob([csv_string], {
                type: mime_type
                }));
                a.setAttribute('download', file_name);
                document.body.appendChild(a);
                a.click();
                document.body.removeChild(a);
            } else {
                location.href = 'data:application/octet-stream,' + encodeURIComponent(csv_string); // only this mime type is supported
            }

        }

    };

    /** -------------------------------------------------------------- //
    
    Init
    
    */

    APP.init = function() {

        ["XMLHttpRequest", "URLSearchParams"].forEach(function(feature, i) {
            if(!window[feature]) { APP.fail("Missing: ", feature); return false; }
        });

        const urlParams = new URLSearchParams(window.location.search);
        const address = urlParams.get('address');

        if(address) {

            APP.config.nodes.inputs.address.value = address;
            APP.events.address_change();

        }

        APP.config.modals.errors = new bootstrap.Modal(document.getElementById('errors'), {
            keyboard: false
        });

        APP.config.nodes.inputs.address.addEventListener('change', APP.events.address_change);
        APP.config.nodes.inputs.address.addEventListener('keyup', APP.events.address_change);
        APP.config.nodes.buttons.start.addEventListener('click', APP.events.start);
        APP.config.nodes.buttons.csv.addEventListener('click', APP.events.csv);

    };

    APP.init();

    return APP;

};

window.onload = function() {

    window.APP = new APP();

};