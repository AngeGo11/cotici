from django.http import JsonResponse


def health(request):
    return JsonResponse({"module": "audits", "status": "ok"})

# Create your views here.
