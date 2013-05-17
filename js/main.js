$(".markdown").each(function() {
    var content = $(this).html(),
        html = mentDoc.markdown.convertHtml(content);
    
    $(this).empty().html(html);
})

$(".mentDoc").each(function() {
    mentDoc.compile(this.innerHTML).execute();
})