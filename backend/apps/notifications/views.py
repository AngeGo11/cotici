from django.http import JsonResponse


def health(request):
    return JsonResponse({"module": "notifications", "status": "ok"})

# Create your views here.
