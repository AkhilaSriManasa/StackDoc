let api_calls = [];
let api_examples;
let api_description;

function getData(url, callback) {
	$.get(url, (data) => {
		callback(data);
	});
}

function createElementFromHTML(htmlString) {
    let div = document.createElement('div');
    div.innerHTML = htmlString.trim();
    return div.firstChild;
}

function logCurrentState(msg) {
	console.log(msg);
	console.log(api_description, api_examples);
}

function xpath(xpath_string, dom) {
    var result = [];
    var nodes_snapshot = document.evaluate(xpath_string, dom, null, XPathResult.ORDERED_NODE_SNAPSHOT_TYPE, null);
   for (var i = 0; i < nodes_snapshot.snapshotLength; i++) {
        result.push(nodes_snapshot.snapshotItem(i));
    }
    return result;
}

function getMatchingAPIObject(api_hq_name) {
	// getMatchingAPIObject will return the matching api object including the package name, module name and api call
	// console.log("api_hq_name = ", api_hq_name);
	const api_elements = api_hq_name.split(".");
	
	if(api_elements.length == 1) {
		var api_name = api_elements[0];
	}
	else {
		if (binarySearch(classSearchIndex, api_elements[0]) >= 0) {
			var api_classname = api_elements[0];	
		}		
		var api_name = api_elements[1];
	}
	
	const api_index_tmp = binarySearch(apiSearchIndex, api_name);
	// first get an index value then search forward as well as backward of the index position for similar entries

	const api_index = apiSearchIndexOrder[api_index_tmp];
	// some entries are not sorted properly. Hence need to take care by explicitly specifying the order

	if (!api_index || api_index < 0 || api_index > apiSearchIndex.length-1) {
		console.log("error in api_index");
		return undefined;
	}

	let api_object = memberSearchIndex[api_index];
	
	if(!api_object) {
		console.log("error in api_object")
	}

	if (api_classname && api_classname != api_object["c"]) {
		let goBack = api_index-1;
		let goForward = api_index+1;

		while(api_object["c"] != api_classname && api_object["l"].replace(/\(.*\)/g, "") == api_name) {
			// go backward
			api_object = memberSearchIndex[goBack];
			goBack -= 1;
		}

		while(api_object["c"] != api_classname && api_object["l"].replace(/\(.*\)/g, "") == api_name) {
			// go forward
			api_object = memberSearchIndex[goForward];
			goForward += 1;
		}
	}
	
	// var api_fq_name = api_object["p"] + "." + api_object["c"] + "." + api_name;

	return api_object;
}

function extractAPICalls() {
	const code_elements = document.querySelectorAll("code");
	const api_regex = /(([a-zA-Z$_]+[a-zA-Z0-9$_]*)\.)?[a-zA-Z$_]+[a-zA-Z0-9$_]*\(/gm;
	let api_calls_set = new Set();
	let m;

	for (let i = code_elements.length - 1; i >= 0; i--) {
		each_snippet = code_elements[i].innerText;
		while ((m = api_regex.exec(each_snippet)) !== null) {
		    
		    if (m.index === api_regex.lastIndex) {
		        api_regex.lastIndex++;
		    }
		    
		    m.forEach((match, groupIndex) => {
		        // console.log(`Found match, group ${groupIndex}: ${match}`);
		        if (groupIndex == "0") {
		        	api_call = match.substr(0, match.length - 1);
		        	api_calls_set.add(api_call);
		        }
		    });
		}
	}

	api_calls = Array.from(api_calls_set);
}

function highlight(_apiCall, _url, _api_fq_name) {
	// this function should highlight the api call as done by ExampleCheck
	// BUG: Partial letters are highlighted. Problem caused due to the contains in find below; it should be equals

	//console.log("Highlight ", _apiCall);
	_apiElements = _apiCall.split(".");

	if (_apiElements.length > 1) {
		let candidate_apis = $(".typ:contains(" + _apiElements[0] + ")");
		let the_one_api;
		for (var i = candidate_apis.length - 1; i >= 0; i--) {
			if (candidate_apis[i].nextSibling.innerText == "." && candidate_apis[i].nextSibling.nextSibling.innerText == _apiElements[1]) {
				candidate_apis[i].setAttribute("class", "pln");
				// $.find(candidate_apis[i]).attr({"data-innerText":candidate_apis[i].innerText.trim()});
				candidate_apis[i].innerText += "." + _apiElements[1];
				candidate_apis[i].nextSibling.innerText = "";
				candidate_apis[i].nextSibling.nextSibling.innerText = "";			
			}
		}
	}
	
	const to_be_replaced = $("code").find($(".pln:contains(" + _apiCall + ")")).first().html()
	// const to_be_replaced = $("code").find($("[data-innerText='" + _apiCall + "']")).first().html()
	if (to_be_replaced) {
		
		const replaced = to_be_replaced.replace(_apiCall, '<a data-toggle="popover" id="popoverLink_'+ _apiCall + '"' + '  data-href="'+ _url.trim() + '"' + 'data-api="' + _api_fq_name + '"data-title="API Documentation" data-container="body" data-html="true"><span class="api-call_' + _apiCall + '" style="background-color: #FFFF00">' + _apiCall + '</span></a>');
		$("code").find($(".pln:contains(" + _apiCall + ")")).first().attr({class: "pln_mod"}).html(replaced);
	}
	else {
		console.log("Couldn't find ", _apiCall);
	}
}

function getDescription(url, api_fq_name) {
	console.log("getDescription");
	// this function will get meaning from cr.openjdk.net preferably version 10
	getData(url, (data) => {
		const a_id = url.split("#")[1];		
		const dom = createElementFromHTML(data);
		const result = xpath("//a[@id="+'"'+a_id+'"]', dom);		
		const blocklist = result[0].nextSibling.nextSibling;
		console.log(blocklist);
		const desc = blocklist.firstChild.nextSibling;//.children[2];
		// console.log(desc.innerHTML);
		// console.log($(dom).find("a#"+a_id).next().innerText);
		api_description = desc.innerHTML;
		$("#myPopup")[0].innerHTML += "<strong><h2>API Description</h2></strong>";
		$("#myPopup")[0].innerHTML += api_description;

		getExamples(api_fq_name);
		// $(this).simplePopup({ type: "html", htmlSelector: "#myPopup" });
	});
}

function getExamples(api_name) {
	// this function will get example links from jexamples.com
	// "http://www.jexamples.com/srchRes/fwd?queryText="
	console.log("getExamples");
	const jex_url = "http://www.jexamples.com/srchRes/";
	const search_url = jex_url + api_name;
	getData(search_url, (data) => {
		const dom = createElementFromHTML(data);
		const links = xpath('//div[@id="searchRes"]/a', dom);
		const examples = xpath('//div[@id="searchRes"]/div[@class="srccode"]', dom);		
		// console.log(links[0], examples[0]);

		let par = document.createElement("div");
		try {
			par.appendChild(examples[0]);
			par.appendChild(links[0]);
		}
		catch(e) {
			console.log(e);
		}
		try {			
			par.appendChild(examples[1]);
			par.appendChild(links[2]); // links[1] is copyright link
			console.log(e);
		}
		catch(e) {

		}
		api_examples = par.innerHTML;
		api_examples = api_examples.replace(/href=\"/g,"href=\"http://www.jexamples.com");
		logCurrentState("After getExamples");
		$("#myPopup")[0].innerHTML += "<strong><h2>API Examples</h2></strong>";		
		$("#myPopup")[0].innerHTML += api_examples;		
		$(this).simplePopup({ type: "html", htmlSelector: "#myPopup" });
		// $("div.simple-popup-content").append(api_examples);
	});
}

function createPopup() {
	let popup = document.createElement("div");
	popup.setAttribute("id", "myPopup");
	popup.setAttribute("style","display: none;");
	$("body").append(popup);
}

function getURLFromObject(api_object) {
	let url = "";
	const base_url = "http://cr.openjdk.java.net/~iris/se/10/latestSpec/api/";
	if (api_object.p === "<Unnamed>") {
            url = api_object.c + ".html" + "#";
        } else {
            url = api_object.p.replace(/\./g, '/') + "/" + api_object.c + ".html" + "#";
        }
        if (api_object.url) {
            url += api_object.url;
        } else {
            url += api_object.l;
    }
    return base_url + url;
}

function main() {
	extractAPICalls();
	for (let i = api_calls.length - 1; i >= 0; i--) {
		each_api_call = api_calls[i];
		// here each_api_call could contain variable.func()
		let api_object = getMatchingAPIObject(each_api_call);		
		
		if (api_object) {
			console.log(getURLFromObject(api_object));

			const api_hq_name = api_object["c"] + "." + api_object["l"].replace(/\(.*\)/g, "");			
			const api_fq_name = api_object["p"] + "." + api_hq_name;

			highlight(api_hq_name, getURLFromObject(api_object), api_fq_name);
			highlight(api_object["l"].replace(/\(.*\)/g, ""), getURLFromObject(api_object), api_fq_name);
		}
	}
}

// getDescription("http://cr.openjdk.java.net/~iris/se/10/latestSpec/api/java/util/Arrays.html#asList(T...)");
// getExamples("java.util.Random.nextInt");

$(document).on("click", ".pln_mod", function(e) {
	e.preventDefault();
	$("#myPopup")[0].innerHTML = "";

	const api_id = e.target.parentNode.getAttribute("id");
	const api_href = e.target.parentNode.getAttribute("data-href");
	const api_fq_name = e.target.parentNode.getAttribute("data-api");
	//console.log(api_id, api_href, api_fq_name);
	getDescription(api_href, api_fq_name);
	//getExamples(api_fq_name);	
    //$(this).simplePopup({ type: "html", htmlSelector: "#myPopup" });
});

$(document).ready(function() {
	main();
	createPopup();
});
