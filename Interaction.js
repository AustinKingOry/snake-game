$(document).ready(function (){
    $("#toggle-interactions").on("click", function (){
        let isVisible = $("#interactions").hasClass("block");
        isVisible ? $("#interactions").addClass("hidden") : $("#interactions").addClass("block");
        isVisible ? $("#interactions").removeClass("block") : $("#interactions").removeClass("hidden");
    })
    $('.tab-trigger').on('click',function(){
        let is_active = $(this).hasClass('active');
        if(is_active){
            $(this).addClass('dark:!text-blue-500 dark:!border-blue-500 text-blue-600 border-blue-600');
            $(this).removeClass('hover:text-gray-600 hover:border-gray-300 dark:hover:!text-gray-300 border-transparent');
            $(this).closest('li').siblings('li').find('button').addClass('hover:text-gray-600 hover:border-gray-300 dark:hover:!text-gray-300 border-transparent');
            $(this).closest('li').siblings('li').find('button').removeClass('dark:!text-blue-500 dark:!border-blue-500 text-blue-600 border-blue-600');
        }
    })
})